import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { JSONRPCMessage } from "@modelcontextprotocol/server";

/** Bound SDK schema errors too: validation can report one error per input item. */
export class BoundedStdioTransport extends StdioServerTransport {
  override send(message: JSONRPCMessage): Promise<void> {
    if (
      "result" in message &&
      message.result.isError === true &&
      Array.isArray(message.result.content)
    ) {
      const text = message.result.content
        .filter((block: { type?: string }) => block.type === "text")
        .map((block: { text?: string }) => block.text ?? "")
        .join("\n")
        .slice(0, 1000);
      message = {
        ...message,
        result: { ...message.result, content: [{ type: "text", text }] },
      };
    }
    if ("error" in message) {
      message = {
        ...message,
        error: {
          ...message.error,
          message: message.error.message.slice(0, 1000),
        },
      };
    }
    return super.send(message);
  }
}
