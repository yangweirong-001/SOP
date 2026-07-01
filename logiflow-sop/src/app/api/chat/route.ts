import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClientMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  messages: ClientMessage[];
  sopSnapshot?: string;
}

const SYSTEM_PROMPT = `你是 "LogiAgent"，一位资深的物流标准作业程序（SOP）顾问。

你的能力包括：
1. 流程优化：识别冗余步骤，建议合并 / 拆分，给出量化收益（如节省时间、人力）。
2. 风险识别：找出可能的差错点、合规风险、责任界定问题，并给出管控措施。
3. 培训文档：把 SOP 转写成新人易懂的操作指南、检查清单或考核题。
4. 合规校验：依据 ISO 9001、AQL、海关 / 冷链等行业规范给出建议。

回答风格：
- 中文，专业精准，不要客套寒暄；
- 优先用编号 / 项目符号给结构；
- 涉及数字给出大致量化（百分比、分钟、批次等）；
- 如对方提供了「当前 SOP 快照」，请贴近其步骤内容回答；
- 不要捏造接口、表名、政策条款，没有把握就说"建议进一步确认"。`;

function buildPrompt(body: RequestBody): {
  role: 'system' | 'user' | 'assistant';
  content: string;
}[] {
  const messages: {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (body.sopSnapshot) {
    messages.push({
      role: 'system',
      content: `当前正在编辑的 SOP 快照（JSON）：\n${body.sopSnapshot}`,
    });
  }
  for (const m of body.messages.slice(-12)) {
    messages.push({ role: m.role, content: m.content });
  }
  return messages;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'invalid_json' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (
    !body.messages ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    !body.messages.some((m) => m.role === 'user')
  ) {
    return new Response(
      JSON.stringify({ error: 'messages_required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);

  const messages = buildPrompt(body);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const llmStream = client.stream(messages, {
          model: 'doubao-seed-2-0-pro-260215',
          temperature: 0.6,
        });
        for await (const chunk of llmStream) {
          if (chunk.content) {
            send({ type: 'delta', content: chunk.content.toString() });
          }
        }
        send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error';
        send({ type: 'error', error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'chunked',
    },
  });
}
