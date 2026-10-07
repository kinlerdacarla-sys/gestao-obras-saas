import { applyDecorators } from "@nestjs/common";
import { ApiBody } from "@nestjs/swagger";
import { z } from "zod";
import type { SchemaObject } from "@nestjs/swagger";
export function RequestDoc(schema: z.ZodType) {
  return applyDecorators(
    ApiBody({
      schema: z.toJSONSchema(schema, {
        io: "input",
        unrepresentable: "any",
        target: "openapi-3.0",
      }) as SchemaObject,
    }),
  );
}
