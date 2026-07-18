import { handleGameAction } from "../src/game/session.js";

export default async function handler(request, response) {
  try {
    const action = request.query?.action ?? (request.method === "GET" ? "state" : null);
    const result = await handleGameAction(action, parseBody(request));

    response.setHeader("cache-control", "no-store");
    response.status(result.status).json(result.payload);
  } catch (error) {
    response.setHeader("cache-control", "no-store");
    response.status(error.statusCode ?? 500).json({
      message: error.statusCode ? error.message : "Internal server error."
    });
  }
}

function parseBody(request) {
  if (!request.body) {
    return {};
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  return request.body;
}
