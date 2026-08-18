import { response } from "@mia/commons";

import { sayHello } from "../business/example.mjs";

const { ok, badRequest } = response;

export const handler = async (event) => {
  const body = JSON.parse(event.body || "{}");

  if (!body.name) {
    return badRequest("El nombre es requerido");
  }

  return ok(sayHello(body));
};
