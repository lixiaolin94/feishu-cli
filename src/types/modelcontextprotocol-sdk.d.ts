declare module "@modelcontextprotocol/sdk/types" {
  export interface CallToolResult {
    isError?: boolean;
    content?: Array<{
      type?: string;
      text?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }
}
