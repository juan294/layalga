import { z } from "zod";

export const isoDateSchema = z.iso.date();
export const staySchema = z.tuple([isoDateSchema, isoDateSchema]);
