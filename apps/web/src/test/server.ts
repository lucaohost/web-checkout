import { setupServer } from "msw/node";

export const API_URL = "http://localhost:3000";

export const server = setupServer();
