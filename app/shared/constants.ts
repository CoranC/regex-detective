export enum Message {
  SEARCH_FOR_TERMS = 'SEARCH_FOR_TERMS',
  FOUND_TERMS = 'FOUND_TERMS',
  FIND_ON_PAGE = 'FIND_ON_PAGE'
}

/** The max amount of results to send back to the popup. */
export const MAX_RESULTS_LIMIT = 500;