export class PipelineError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function publicError(error) {
  if (error instanceof PipelineError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return { code: "INTERNAL_ERROR", message: "岗位检索服务暂时不可用。" };
}
