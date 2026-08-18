import * as postgres from "@mia/postgres";
import { response } from "@mia/commons";

export const handler = async (event) => {
  try {
    const result = await postgres.health();
    return response.ok({
      api: "🐾 MIA AVANZA CONTIGO - base",
      ...result,
    });
  } catch (error) {
    console.error(error);
    return response.serverError(error.toPublic());
  }
};
