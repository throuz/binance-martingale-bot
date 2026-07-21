class HttpError extends Error {
  constructor(message, { status, body, method, path }) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

export { HttpError };
