import { Socket } from 'socket.io';
export declare function address(socket: Socket, user: string, host: string): Promise<string>;
