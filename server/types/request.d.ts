// What the server's middleware puts on a request, so every route reads one contract.
declare global {
  namespace Express {
    interface Request {
      /** The signed-in reader, set by browser sign-in or an agent token. */
      user: { id: string; username?: string; iat?: number; exp?: number };
      authInfo?: { tokenSource?: string; iat?: number; exp?: number; scopes?: string[] };
      agentToken?: ReturnType<typeof import('../services/agentTokenService').sanitizeAgentToken>;
      personalAgent?: {
        id: string; userId: string; name: string;
        capabilities: Record<string, boolean>; preferredWorkerRoles: string[];
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
