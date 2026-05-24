import serve from 'serve-static';
export declare const trim: (str: string) => string;
export declare const serveStatic: (path: string) => serve.RequestHandler<import("http").ServerResponse<import("http").IncomingMessage>>;
