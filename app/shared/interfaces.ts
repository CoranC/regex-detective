import {Message} from './constants';

interface Payload {
  message: Message;
  data: {};
}

export interface FoundTermsResponse extends Payload {
  message: Message;
  data: FoundTermsData;
}

export interface FoundTermsData {
  url: string;
  foundTerms: string[];
  totalFoundTermsCount: number;
}

export interface SearchForTermsData {
  searchPattern: string;
  flags: string;
  captureGroupIndex: number;
}

export interface SearchForTermsRequest extends Payload {
  message: Message;
  data: SearchForTermsData;
}

export interface FindOnPageRequest {
  message: Message;
  data: {term: string};
}


export type Request = FindOnPageRequest|SearchForTermsRequest;
export type Response = FoundTermsResponse;