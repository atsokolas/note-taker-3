// What the server's middleware puts on a request, so every route reads one contract.
import type { Request, Response, NextFunction } from 'express';

/** A record as it arrived, from a request or from Mongo: its fields are whatever was sent. */
export type Fields = Record<string, any>;

/** Middleware as this server writes it: it may return the response it sent. */
export type Handler = (req: Request, res: Response, next: NextFunction) => void | Response | Promise<unknown>;

declare global {
  namespace Express {
    interface Request {
      /** The signed-in reader, set by browser sign-in or an agent token. */
      user: { id: string; username?: string; iat?: number; exp?: number };
      authInfo?: { tokenSource?: string; iat?: number; exp?: number; scopes?: string[] };
      agentToken?: ReturnType<typeof import('../services/agentTokenService').sanitizeAgentToken>;
      personalAgent?: {
        id: string; userId: string; name: string;
        capabilities: Record<string, boolean>; preferredWorkerRoles: string[]; persona: string;
      };
      bridgeActor?: { userId: string; actorType: string; actorId: string; scope: string };
      thoughtEdition?: import('mongoose').Document & Record<string, any>;
      requestId?: string;
      /** body-parser's own flag that the body has been read. */
      _body?: boolean;
      chatgptOAuthBodyBounded?: boolean;
    }
  }
}
export {};
