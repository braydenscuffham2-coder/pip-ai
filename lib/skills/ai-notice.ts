// The first reply a customer gets must say it is an AI, whatever the model wrote.
// pip-turn enforces the same rule for Forge Board teammates; this covers the older chat path
// (classic specs served by /api/runtime/chat). Keep the pattern and wording in step with pip-turn.
const AI_RE = /(\b(ai|artificial intelligence|automated assistant|virtual assistant|bot)\b|\ba\.i\.)/i;

/** Returns the reply to send. On a conversation's first reply, an AI notice is put in front if the model left it out. */
export function withAiNotice(reply: string, first: boolean, teammate: string, business: string): string {
  if (!first || AI_RE.test(reply)) return reply;
  const who = (teammate || '').trim(), where = (business || '').trim();
  return `This is ${who ? `${who}, ` : ''}an AI assistant${where ? ` for ${where}` : ''}. ${reply}`;
}
