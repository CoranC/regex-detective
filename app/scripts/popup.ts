import {Message, MAX_RESULTS_LIMIT} from '../shared/constants';
import {SearchForTermsRequest, FindOnPageRequest, FoundTermsResponse, SearchForTermsData} from '../shared/interfaces';
import { ChromeStorageService, StorageSearchResultsForUrl, StoragePatternObject, ChromeStorageKey} from './chrome_storage_service';
// import { thistle } from 'color-name';
const snackbar = require('snackbar');
snackbar.duration = 2000;

/**
 * Regex pattern for a capture group's open bracket.
 * Uses a negative look behind to ignore an escape character before the bracket.
 * i.e Finds "(" but doesn't find "\(";
 */
const CAPTURE_GROUP_OPEN_BRACKET = /(?<!\\)\(/g;
/**
 * Regex pattern for a capture group's close bracket.
 * Same implementation as the open bracket regex but looks for a closing bracket.
 * i.e Finds ")" but doesn't find "\)";
 */
const CAPTURE_GROUP_CLOSE_BRACKET = /(?<!\\)\)/g;

interface ChromeWindow extends Window {
  chrome: any;
}

class Popup {
  private chromeStorageService = new ChromeStorageService();
  private checkboxes: NodeListOf<HTMLInputElement> = this.window.document.querySelector('#checkboxes')!.querySelectorAll('input');
  private regexInput: HTMLInputElement = this.window.document.querySelector('#regex-input') as HTMLInputElement;
  private patternDisplay = this.window.document.querySelector('#regex-display > .pattern')! as HTMLElement;
  private flagsDisplay = this.window.document.querySelector('#regex-display > .flags')! as HTMLElement;
  private tableBody = this.window.document.querySelector('tbody')!;
  private searchButton = this.window.document.querySelector('#search-btn')! as HTMLButtonElement;
  private toggleBottomIcon = this.window.document.querySelector('.expand-bottom')! as HTMLButtonElement;
  private bottomDiv = this.window.document.querySelector('.bottom')! as HTMLElement;
  private captureGroupInput = this.window.document.querySelector('#capture-group-input')! as HTMLInputElement;
  private copyTermsIcon = this.window.document.querySelector('.copy-terms')! as HTMLElement;

  constructor(private window: ChromeWindow) {}

  /**
   * Sends a given payload to the active tab.
   * @param payload Any payload object to send to the content script.
   */
  private sendMessageToActiveTab(payload: {}) {
    this.window.chrome.tabs.query({currentWindow: true, active: true}, (tabs: {id: string}[]) => {
      const activeTab = tabs[0];
      this.window.chrome.tabs.sendMessage(activeTab.id, payload);
   });
  }

  /**
   * Retrieves any stored data from chrome storage.
   * Specifically the last typed regex pattern and flags, and the search results
   * for the given URL.
   */
  private initFromStorage() {
    this.chromeStorageService.getPatternObj().then(
      (result: StoragePatternObject|null) => {
        if (result &&
            result[ChromeStorageKey.PATTERN_OBJECT] &&
            result[ChromeStorageKey.PATTERN_OBJECT].searchPattern) {
          const patternObject = result[ChromeStorageKey.PATTERN_OBJECT] as SearchForTermsData;
          this.uiSetRegexFromData(patternObject);
          this.captureGroupInput.value = `${patternObject.captureGroupIndex}`;
          this.uiToggleCaptureGroupInput();
        }
      });

    this.window.chrome.tabs.query({currentWindow: true, active: true}, (tabs: {id: string, url: string}[]) => {
      const activeTab = tabs[0];
      this.chromeStorageService.getSearchResultsForUrl(activeTab.url).then(
        (result: StorageSearchResultsForUrl|null) => {
          if (!result) {
            return;
          } else {
            this.uiShowSearchResults(result.SEARCH_RESULTS);
          }
        });
    });
  }

  /**
   * Sends a message to the content script with the search pattern and flags.
   * @param inputValue The current value of the regex Input element.
   */
  private searchForTerms() {
    console.log(this.regexInput.value);
    const patternObj = {
      searchPattern: this.regexInput.value,
      flags: this.getFlags(),
      captureGroupIndex: Number(this.captureGroupInput.value)
    };
    const payload: SearchForTermsRequest = {
      message: Message.SEARCH_FOR_TERMS,
      data: patternObj
    };
    this.sendMessageToActiveTab(payload);
  }

  /**
   * Creates a regular expression flag string from the checkboxes.
   */
  private getFlags() {
    let flags = '';
    Array.from(this.checkboxes).map((el: HTMLInputElement) => {
      if (el.checked) {
        flags += el.id;
      }
    });
    return flags;
  }

  /**
   * Sends a message to the content script to search for the given term.
   * @param term The term to find on the page.
   */
  private findTermOnPage(term: string) {
    const payload: FindOnPageRequest = {
      message: Message.FIND_ON_PAGE,
      data: {term}
    };
    this.sendMessageToActiveTab(payload);
  }

  /**
   * Listens to changes on the regex pattern Input element and the flag
   * checkboxes. If a change occurs, it validates and displays the new regex.
   */
  observeInput() {
    this.regexInput.addEventListener('input', (e: InputEvent) => {
      console.log(e);
      if (e.inputType.match(/insertText|deleteContentBackward|insertFromPaste/gm)) {
        this.validateAndDisplayRegex(this.regexInput.value);
      }
    });
    // this.regexInput.addEventListener('change', () => this.validateAndDisplayRegex(this.regexInput.value));
    this.regexInput.addEventListener('blur', () => this.uiToggleCaptureGroupInput());
    Array.from(this.checkboxes).forEach((checkboxEl) => {
      checkboxEl.addEventListener('change', () => this.validateAndDisplayRegex(this.regexInput.value));
    });
  }

  private uiToggleCaptureGroupInput() {
    const regexInputValue = this.regexInput.value || '';
    const countOfCaptureGroupsStart = (regexInputValue.match(CAPTURE_GROUP_OPEN_BRACKET) || []).length;
    const countOfCaptureGroupsEnd = (regexInputValue.match(CAPTURE_GROUP_CLOSE_BRACKET) || []).length;
    if (countOfCaptureGroupsStart > 0 && countOfCaptureGroupsStart === countOfCaptureGroupsEnd ) {
      this.captureGroupInput.disabled = false;
      this.captureGroupInput.setAttribute('max', `${countOfCaptureGroupsStart}`);
      // change capture group count in input to largest valid group.
      if (Number(this.captureGroupInput.value) > countOfCaptureGroupsStart) {
        this.captureGroupInput.value = `${countOfCaptureGroupsStart}`;
      }
    } else {
      this.captureGroupInput.disabled = true;
      this.captureGroupInput.value = '0';
    }
  }

  /**
   * Validates the regex pattern and, if it is valid, displays it to the user
   * on the popup.
   * @param regexPattern The string pattern to create a regex from.
   */
  private validateAndDisplayRegex(regexPattern: string) {
    const flags = this.getFlags();
    if (!regexPattern) {
      this.uiUpdateRegexDisplay('', flags);
      return;
    }
    const captureGroupIndex = Number(this.captureGroupInput.value);
    let regexp: RegExp|null = null;
    this.chromeStorageService.setPatternObj({
      searchPattern: regexPattern,
      flags,
      captureGroupIndex
    });
    try {
      regexp = new RegExp(regexPattern, flags);
    } catch (e) {
      this.uiSetIsValidRegexPattern(false);
    }
    if (!regexp) {
      return;
    }
    this.uiSetIsValidRegexPattern(true);
    this.uiUpdateRegexDisplay(regexPattern, flags);
  }

  /**
   * Updates the displayed regex with a class for valid or invalid.
   * This indicates to a user whether their regex will work or not.
   * @param isValid whether the pattern is valid or not.
   */
  private uiSetIsValidRegexPattern(isValid: boolean) {
    if (isValid) {
      this.patternDisplay.classList.add('valid');
      this.patternDisplay.classList.remove('invalid');
    } else {
      this.patternDisplay.classList.add('invalid');
      this.patternDisplay.classList.remove('valid');
    }
  }

  /**
   * Given a data object containing the  search pattern and flags, we set the
   * value of the regex Input element and mark the specific checkboxes for the
   * given flags.
   * @param searchPatternData
   */
  private uiSetRegexFromData(searchPatternData: SearchForTermsData) {
    if (!searchPatternData.searchPattern) {
      return;
    }
    const input = this.window.document.getElementById('regex-input') as HTMLInputElement;
    input.value = searchPatternData.searchPattern;
    Array.from(this.checkboxes).forEach((checkboxEl) => {
      if (searchPatternData.flags.indexOf(checkboxEl.id) > -1) {
        checkboxEl.checked = true;
      } else {
        checkboxEl.checked = false;
      }
    });
    this.uiUpdateRegexDisplay(searchPatternData.searchPattern, searchPatternData.flags);
  }

  /**
   * Displays the regex pattern to the user.
   * @param regexPattern
   * @param flags
   */
  private uiUpdateRegexDisplay(regexPattern: string, flags: string) {
    this.patternDisplay.innerText = regexPattern;
    this.flagsDisplay.innerText = flags;
  }

  private uiToggleBottomHidden() {
    if (this.bottomDiv.classList.contains('hidden')) {
      this.bottomDiv.classList.remove('hidden');
      this.toggleBottomIcon.classList.remove('fa-chevron-down');
      this.toggleBottomIcon.classList.add('fa-chevron-up');
    } else {
      this.bottomDiv.classList.add('hidden');
      this.toggleBottomIcon.classList.remove('fa-chevron-up');
      this.toggleBottomIcon.classList.add('fa-chevron-down');
    }
  }

  /**
   * Displays the search results container div.
   * @param foundTerms A list of found terms to display.
   */
  private uiShowSearchResults(foundTerms: string[]) {
    const foundTermCountEl = this.window.document.getElementById('found-term-count')!;
    let foundTermsText = '';
    let matchString = foundTerms.length === 1 ? 'match' : 'matches';
    if (foundTerms.length >= MAX_RESULTS_LIMIT) {
      foundTermsText = `${foundTerms.length} (max) ${matchString} discovered`;
    } else {
      foundTermsText = `${foundTerms.length} ${matchString} discovered`;
    }
    foundTermCountEl.innerText = foundTermsText;
    const foundTermsDiv = this.window.document.getElementById('found-term-div')!;
    if (foundTerms.length) {
      foundTermsDiv.style.display = 'block';
      this.copyTermsIcon.classList.remove('hidden');
      this.uiCreateTable(foundTerms);
    } else {
      this.copyTermsIcon.classList.add('hidden');
      foundTermsDiv.style.display = 'none';
      this.uiClearTable();
    }
  }

  /**
   * Creates a table to display each found term. Also contains a clickable icon
   * which searches for that term on the content page.
   * @param foundTerms
   */
  private uiCreateTable(foundTerms: string[]) {
    this.uiClearTable();
    foundTerms.sort().forEach((foundTerm) => {

      const row = document.createElement('TR');
      const cell1 = document.createElement('TD');
      const cell2 = document.createElement('TD');
      const cell3 = document.createElement('TD');

      cell1.innerText = foundTerm;
      cell1.classList.add('found-term');

      const searchIcon = this.uiCreateIcon('fa', 'fa-search');
      cell2.append(searchIcon);
      cell2.classList.add('search');
      cell2.classList.add('text-center');
      cell2.addEventListener('click', () => {
        this.findTermOnPage(foundTerm);
      });

      const copyIcon = this.uiCreateIcon('far', 'fa-copy');
      cell3.appendChild(copyIcon);
      cell3.classList.add('text-center');
      cell3.addEventListener('click', () => {
        this.copyFoundTermsToClipboard([foundTerm]);
      });

      row.appendChild(cell1);
      row.appendChild(cell2);
      row.appendChild(cell3);
      this.tableBody.appendChild(row);
    });
  }

  private uiClearTable() {
    this.tableBody.innerHTML = '';
  }

  private uiCreateIcon(iconClassPrefix: string, iconClassText: string) {
    const icon = document.createElement('I');
    icon.classList.add(iconClassPrefix);
    icon.classList.add(iconClassText);
    icon.classList.add('re-icon');
    return icon;
  }

  private uiToggleIsLoading(isLoading: boolean) {
    const pageloader = this.window.document.querySelector('.pageloader')! as HTMLElement;
    if (isLoading) {
      pageloader.classList.add('is-active');
    } else {
      pageloader.classList.remove('is-active');
    }
    if (isLoading) {
      setTimeout(() => this.uiToggleIsLoading(false), 200);
    }
  }

  /**
   * Retreives any previous stored data from chrome storage.
   * Sets up listeners for messages from the content script.
   */
  init() {
    this.initFromStorage();

    this.window.document.addEventListener('DOMContentLoaded', () => {
      this.searchButton.addEventListener('click', () => {
        // this.uiToggleIsLoading(true);
        this.searchForTerms();
      });
      this.toggleBottomIcon.addEventListener('click', () => {
        this.uiToggleBottomHidden();
      });
      this.copyTermsIcon.addEventListener('click', () => {
        const foundTerms = Array.from(this.tableBody.querySelectorAll('.found-term'))
          .map((cell: HTMLTableDataCellElement) => cell.innerText);
          this.copyFoundTermsToClipboard(foundTerms);
      });
      this.uiToggleCaptureGroupInput();
    });

    this.window.chrome.runtime.onMessage.addListener(
      (request: FoundTermsResponse) => {
        console.log(request);
        if ( request.message === Message.FOUND_TERMS ) {
          this.chromeStorageService.setSearchResultsForUrl({
            [ChromeStorageKey.URL]: request.data.url,
            [ChromeStorageKey.SEARCH_RESULTS]: request.data.foundTerms
          });
          this.uiShowSearchResults(request.data.foundTerms);
        }
      });
  }

  private copyFoundTermsToClipboard(foundTerms: string[]) {
    const foundTermsString = foundTerms.join('\n');
    navigator.clipboard.writeText(foundTermsString).then(function() {
      console.log('Async: Copying to clipboard was successful!');
      const itemString = foundTerms.length === 1 ? 'item' : 'items';
      snackbar.show(`${foundTerms.length} ${itemString} copied.`);
    }, function(err) {
      console.error('Async: Could not copy text: ', err);
    });
  }

}

const popup = new Popup(window as any as ChromeWindow);
popup.init();
document.addEventListener('DOMContentLoaded', () => {popup.observeInput(); });
