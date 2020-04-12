import {Message, MAX_RESULTS_LIMIT} from '../shared/constants';
import {Request, FindOnPageRequest, SearchForTermsRequest, FoundTermsResponse} from '../shared/interfaces';

interface FindWindow extends Window {
  find: Function;
  chrome: any;
}

const FIND_CONFIG = {
  caseSensitive: false,
  backwards: false,
  wrapAround: true,
  wholeWord: false,
  searchInFrames: true,
  showDialog: true
};

class ReFinder {

  /** The regex pattern to be searched on this page. */
  pattern: RegExp|null = null;
  /** The capture group index of the pattern. 0 as default for full pattern. */
  captureGroupIndex = 0;
  /** A list of text nodes to be searched. */
  textNodes: Node[] = [];
  /** A list of terms found from the pattern. */
  foundTerms: string[] = [];
  /** The count of terms found from the pattern. */
  totalFoundTermsCount = 0;
  /** The url of this page. */
  url = '';

  constructor(private window: FindWindow) {
    this.url = window.location.href;
  }

  /**
   * Sets up listeners for messages from the popup.
   */
  init() {
    this.window.chrome.runtime.onMessage.addListener(
      (request: Request) => {
        if ( request.message === Message.SEARCH_FOR_TERMS ) {
          request = request as SearchForTermsRequest;
          this.textNodes = [];
          this.foundTerms = [];
          this.setRegexFromString(request.data.searchPattern, request.data.flags);
          this.captureGroupIndex = request.data.captureGroupIndex;
          if (this.pattern) {
            this.searchDomForPattern();
            this.sendBackFoundTerms();
          }
        } else if (request.message === Message.FIND_ON_PAGE) {
          request = request as FindOnPageRequest;
          this.findOnPage(request.data.term);
        }
      }
    );
  }

  /**
   * Sends the founds terms for this url back to the popup.
   */
  private sendBackFoundTerms() {
    const payload: FoundTermsResponse = {
      message: Message.FOUND_TERMS,
      data: {
        url: this.url,
        foundTerms: [...this.foundTerms],
        totalFoundTermsCount: this.totalFoundTermsCount
      }
    };
    chrome.runtime.sendMessage(payload);
  }

  /**
   * Searches the dom for the regex pattern and updates the found terms list.
   */
  private searchDomForPattern() {
    if (!this.pattern) {
      return;
    }
    const resi = window.document.body.innerText.matchAll(this.pattern);
    const ignoreCase = this.pattern.ignoreCase;
    let result = resi.next();
    while (!result.done) {
      let term = result.value[this.captureGroupIndex];
      if (ignoreCase) {
        term = term.toLowerCase();
      }
      if (term.trim() !== '' && this.foundTerms.indexOf(term) === -1) {
        this.foundTerms.push(term);
      }
      if (this.foundTerms.length >= MAX_RESULTS_LIMIT) {
        break;
      }
      result = resi.next();
    }
  }

  /**
   * Creates a valid regex pattern from the regex string and flags.
   * @param regexString
   * @param flags
   */
  private setRegexFromString(regexString: string, flags: string) {
    let isValid = true;
    let pattern: RegExp;
    if (flags.indexOf('g') === -1) {
      flags += 'g';
    }
    try {
      pattern = new RegExp(regexString, flags);
    } catch (e) {
      isValid = false;
    }
    if (isValid) {
      this.pattern = pattern!;
    }
  }

  /**
   * Searches for a given term on the page.
   * @param term The term to be found on the page.
   */
  private findOnPage(term: string) {
    this.window.find(term,
      !this.pattern!.ignoreCase,
      FIND_CONFIG.backwards,
      FIND_CONFIG.wrapAround,
      FIND_CONFIG.wholeWord,
      FIND_CONFIG.searchInFrames,
      FIND_CONFIG.showDialog);
  }
}

const reFinder = new ReFinder(window as any as FindWindow);
reFinder.init();
