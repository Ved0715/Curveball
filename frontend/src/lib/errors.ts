export type ErrorCode =
  | "cancelled"
  | "network"
  | "not_configured"
  | "rate_limited"
  | "overloaded"
  | "prompt_too_large"
  | "refused"
  | "invalid_output"
  | "upstream"
  | "interview_over"
  | "nothing_to_score"
  | "file_too_large"
  | "resume_unsupported"
  | "resume_unreadable"
  | "resume_empty"
  | "bad_request"
  | "no_client"
  | "not_found"
  | "awaiting_answer"
  | "no_question"
  | "interview_not_finished"
  | "daily_limit"
  | "no_session"
  | "bad_credentials"
  | "email_taken"
  | "too_many_attempts"
  | "bad_origin"
  | "already_completed"
  | "no_topics"
  | "no_lesson"
  | "focus_required"
  | "queue_full"
  | "bad_timezone";

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public retryable = true,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

const COPY: Record<ErrorCode, string> = {
  cancelled: "Stopped.",
  network: "Couldn't reach the server. Check your connection and try again.",
  not_configured: "The AI isn't set up on the server yet. Add an API key or turn on mock mode.",
  rate_limited: "Lots of people are practising right now. Wait a few seconds, then try again.",
  overloaded: "The AI is busy at the moment. Try again in a few seconds.",
  prompt_too_large: "Your resume or job description is too long. Trim it and try again.",
  refused: "The AI declined that request. Try rephrasing your setup.",
  invalid_output: "The AI's answer came back garbled. Try again.",
  upstream: "Something went wrong on our side. Try again.",
  interview_over: "This interview has already finished.",
  nothing_to_score: "Answer at least one question so there's something to score.",
  file_too_large: "That file is over 5 MB. Try a smaller file or paste the text.",
  resume_unsupported: "Upload a PDF, DOCX or TXT file, or paste your resume text.",
  resume_unreadable: "We couldn't read that file. Paste your resume text instead.",
  resume_empty: "That file has no readable text (scanned PDFs don't). Paste your resume text instead.",
  bad_request: "Some of your setup details look invalid. Check them and try again.",
  no_client: "Your browser session couldn't be identified. Refresh the page and try again.",
  not_found: "We couldn't find that interview. It may have been deleted.",
  awaiting_answer: "The interviewer is waiting for your answer.",
  no_question: "There's no question to get a hint for yet.",
  interview_not_finished: "Finish or end the interview before scoring it.",
  daily_limit: "You've reached today's AI limit. Come back tomorrow for more.",
  no_session: "Please log in to continue.",
  bad_credentials: "That email and password don't match. Try again.",
  email_taken: "There's already an account with that email. Log in instead?",
  too_many_attempts: "Too many attempts. Take a breather and try again in a few minutes.",
  bad_origin: "That request came from somewhere unexpected. Refresh and try again.",
  already_completed: "You've already finished today's topic. See you tomorrow!",
  no_topics: "No topics match your focus areas right now. Turn on another track in Settings.",
  no_lesson: "Open the lesson first, then do the check.",
  focus_required: "Keep at least one focus area switched on.",
  queue_full: "Your queue is full. Learn or remove a few topics first.",
  bad_timezone: "That timezone isn't recognised.",
};

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) return COPY[err.code];
  return COPY.upstream;
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof DOMException && err.name === "AbortError") return new ApiError("cancelled", true);
  if (err instanceof TypeError) return new ApiError("network", true);
  return new ApiError("upstream", true);
}

export function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === "string" && code in COPY;
}
