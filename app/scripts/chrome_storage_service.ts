import {SearchForTermsData} from '../shared/interfaces';

export enum ChromeStorageKey {
  PATTERN_OBJECT = 'PATTERN_OBJECT',
  URL = 'URL',
  SEARCH_RESULTS = 'SEARCH_RESULTS',
}

export interface StorageSearchResultsForUrl {
  [ChromeStorageKey.URL]: string;
  [ChromeStorageKey.SEARCH_RESULTS]: string[];
}

export interface StoragePatternObject {
  [ChromeStorageKey.PATTERN_OBJECT]: SearchForTermsData;
}

/**
 * Allows for setting and retrieiving extension specific data from chrome
 * storage.
 */
export class ChromeStorageService {

  /** Sets an object in chrome storage. */
  private set(item: {}) {
    chrome.storage.local.set(item);
  }

  /** Gets objects from chrome storage. */
  private get(keys: ChromeStorageKey[]): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (items) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError.message);
        } else {
          resolve(items);
        }
      });
    });
  }

  /**
   * Retrives any existing patterns from storage.
   */
  getPatternObj(): Promise<StoragePatternObject|null> {
    return new Promise((resolve, reject) => {
      return this.get([ChromeStorageKey.PATTERN_OBJECT]).then((data: StoragePatternObject) => {
        if (data[ChromeStorageKey.PATTERN_OBJECT].searchPattern) {
          resolve(data);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Saves a pattern object to storage.
   */
  setPatternObj(patternObject: SearchForTermsData) {
    this.set({[ChromeStorageKey.PATTERN_OBJECT]: patternObject});
  }

  /**
   * Resets the search results and the url in storage.
   */
  private clearSearchResultsAndUrl() {
    this.setSearchResultsForUrl({
      [ChromeStorageKey.URL]: '',
      [ChromeStorageKey.SEARCH_RESULTS]: [],
    } as StorageSearchResultsForUrl);
  }

  /**
   * Saves the search results for a given url.
   * @param items
   */
  setSearchResultsForUrl(data: StorageSearchResultsForUrl) {
    this.set({
      [ChromeStorageKey.URL]: data.URL,
      [ChromeStorageKey.SEARCH_RESULTS]: data.SEARCH_RESULTS,
    } as StorageSearchResultsForUrl);
  }

  /**
   * Retrieves the search results for the last url we have. If the url we are
   * currently on doesn't match the url for the results, this means we have left
   * that page and we can clear out the results entirely.
   * @param url The url for the corresponding search results.
   */
  getSearchResultsForUrl(url: string): Promise<StorageSearchResultsForUrl|null> {
    return new Promise((resolve, reject) => {
      return this.get([ChromeStorageKey.URL, ChromeStorageKey.SEARCH_RESULTS])
        .then((data: StorageSearchResultsForUrl) => {
          if (data[ChromeStorageKey.URL] !== url ||
              !data[ChromeStorageKey.SEARCH_RESULTS] ||
              data[ChromeStorageKey.SEARCH_RESULTS].length === 0) {
            // The url is not the same as the current version so we can reset
            // the results.
            this.clearSearchResultsAndUrl();
            resolve(null);
          } else {
            resolve(data as StorageSearchResultsForUrl);
          }
        });
    });
  }
}