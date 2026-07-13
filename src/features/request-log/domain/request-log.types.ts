export type RequestLog = {
  id: string;
  requestId: string;
  appClientId: string;
  providerId: string;
  modelName: string;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestMetadataJson: string;
  responseMetadataJson: string;
  errorMessage: string | null;
  createdAt: string;
};
