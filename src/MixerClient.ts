import * as Mixer from "@mixer/client-node";
import { LogService } from "matrix-bot-sdk";

export interface MixerChannel {
    channelId: number;
    username: string;
    name: string;
    live: boolean;
    avatarUrl: string;
}

export default class MixerClient {
    private client: Mixer.Client;
    private username: string;
    private userId: number;
    private chatService: Mixer.ChatService;

    constructor(token: string, clientId: string) {
        this.client = new Mixer.Client(new Mixer.DefaultRequestRunner());
        this.client.use(new Mixer.OAuthProvider(this.client, <Mixer.IOAuthProviderOptions>{
            clientId: clientId,
            tokens: {
                access: token,
                expires: Date.now() + (365 * 24 * 60 * 60 * 1000),
            },
        }));
    }

    public get mixerChatService(): Mixer.ChatService {
        if (!this.chatService) this.chatService = new Mixer.ChatService(this.client);
        return this.chatService;
    }

    public get mixerUserId(): number {
        return this.userId;
    }

    public async start() {
        const userInfo = (<any>await this.client.request("GET", "users/current")).body;
        this.username = userInfo.username;
        this.userId = userInfo.id;
        LogService.info("MixerClient", `Got information for ${this.username} (${this.userId})`);
    }

    public async getChannel(usernameOrId: string | number): Promise<MixerChannel> {
        try {
            const channelInfo = (<any>await this.client.request("GET", `channels/${usernameOrId}`)).body;
            const channelId = channelInfo.id;
            const name = channelInfo.name;
            const avatarUrl = channelInfo.user.avatarUrl;
            const live = channelInfo.online;
            const username = channelInfo.user.username;

            return {channelId, name, avatarUrl, live, username};
        } catch (e) {
            LogService.error("MixerClient", e);
            return null;
        }
    }
}
