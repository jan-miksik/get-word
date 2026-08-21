/**
 * The word-chat generation pipeline, for other features that need to create
 * study items without walking the learner through the whole conversation.
 *
 * Deliberately just the transport calls: the chat's own state machine,
 * storage and screens stay internal, and the response types are inferred at the
 * call site rather than re-exported.
 */
export {
  requestProposal,
  requestSimilarWords,
  translateSelection,
  commitSession,
} from './client/api';
