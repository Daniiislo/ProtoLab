import { z } from "zod";

export const SessionSchema = z.string().uuid();
export const OrderSchema = z.object({
  step: z.number().int().min(0).max(3),
  updatedAt: z.string().datetime(),
});
export const NotificationSchema = z.object({
  id: z.number().int().positive(),
  text: z.string().min(1).max(240),
  createdAt: z.string().datetime(),
});
export const NotificationBatchSchema = z.object({
  events: z.array(NotificationSchema),
  cursor: z.number().int().nonnegative(),
  timedOut: z.boolean(),
});
export const ProgressSchema = z.object({
  progress: z.number().min(0).max(100),
  step: z.string(),
  done: z.boolean(),
});
export const PaymentSchema = z.object({
  status: z.enum(["pending", "paid"]),
  eventId: z.string().uuid().nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export const DeliverySchema = z.object({
  ok: z.literal(true),
  eventId: z.string().uuid(),
  deliveryStatus: z.number().int(),
});
export const ChatNameSchema = z.string().trim().min(1).max(32);
export const ChatParticipantSchema = z.object({
  id: z.string().uuid(),
  name: ChatNameSchema,
});
export const ChatPresenceSchema = z.object({
  type: z.literal("presence"),
  participants: z.array(ChatParticipantSchema),
});
export const ChatWelcomeSchema = z.object({
  type: z.literal("welcome"),
  clientId: z.string().uuid(),
  participants: z.array(ChatParticipantSchema),
});
export const ChatInputSchema = z.object({
  name: ChatNameSchema,
  text: z.string().trim().min(1).max(500),
});
export const ChatMessageSchema = ChatInputSchema.extend({
  type: z.literal("chat"),
  id: z.string().uuid(),
  senderId: z.string().uuid(),
  recipients: z.array(ChatParticipantSchema),
  createdAt: z.string().datetime(),
});

export type Order = z.infer<typeof OrderSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationBatch = z.infer<typeof NotificationBatchSchema>;
export type Progress = z.infer<typeof ProgressSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatParticipant = z.infer<typeof ChatParticipantSchema>;
