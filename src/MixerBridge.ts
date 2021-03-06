import { Appservice, LogService } from "matrix-bot-sdk";
import MixerClient, { MixerChannel } from "./MixerClient";
import config from "./config";
import MixerStream from "./MixerStream";
import MediaCache from "./caches/MediaCache";

export default class MixerBridge {
    private defaultMixer: MixerClient;
    private channels: { [roomId: number]: MixerStream } = {};
    private mediaCache: MediaCache;

    constructor(private appservice: Appservice) {
        appservice.on("query.room", this.onQueryAlias.bind(this));
        appservice.on("query.user", () => false); // disable user queries
        appservice.on("room.join", (roomId, ev) => this.startChannel(roomId));
        appservice.on("room.message", this.onMessage.bind(this));

        this.defaultMixer = new MixerClient(config.mixer.token, config.mixer.clientId);
        this.mediaCache = new MediaCache(this.appservice);
    }

    public get internalMediaCache(): MediaCache {
        return this.mediaCache;
    }

    public async start() {
        await this.defaultMixer.start();
        await this.syncChannels();
        return this.appservice.begin();
    }

    private async syncChannels() {
        const joinedRooms = await this.appservice.botIntent.getJoinedRooms();
        for (const roomId of joinedRooms) {
            await this.startChannel(roomId);
        }
    }

    private async startChannel(roomId: string, channelId: number = null) {
        if (this.channels[roomId] || !roomId) return;
        try {
            if (!channelId) {
                const ident = await this.appservice.botClient.getRoomStateEvent(roomId, "io.t2bot.mixer.channel", "");
                if (!ident || !ident['channelId']) throw new Error("Invalid channel identity event");
                channelId = ident['channelId'];
            }
            LogService.info("MixerBridge", `Bridging ${channelId} to ${roomId}`);
            this.channels[roomId] = new MixerStream(this.defaultMixer, this.appservice, this, channelId, roomId);
            await this.channels[roomId].start();
        } catch (e) {
            LogService.warn("MixerBridge", e);
        }
    }

    public async calculateRoomDecoration(channelInfo: MixerChannel): Promise<{ name: string, topic: string, avatarUrl: string }> {
        // TODO: Flag room as live streaming
        const name = `${channelInfo.username}: ${channelInfo.name}`;
        const topic = channelInfo.description;
        let avatarUrl = null;
        if (channelInfo.avatarUrl) {
            try {
                avatarUrl = await this.mediaCache.uploadFromUrl(channelInfo.avatarUrl);
            } catch (e) {
                LogService.warn("MixerBridge", e);
            }
        }

        return {name, topic, avatarUrl};
    }

    private async onMessage(roomId: string, event: any) {
        if (this.appservice.isNamespacedUser(event['sender'])) return;
        await this.appservice.botClient.redactEvent(roomId, event['event_id'], "Two-way chat is not supported");
    }

    private async onQueryAlias(roomAlias: string, createRoomFn: (roomCreationContent) => null): Promise<any> {
        try {
            const suffix = this.appservice.getSuffixForAlias(roomAlias);
            const channel = await this.defaultMixer.getChannel(suffix);
            if (!channel) return createRoomFn(false);

            const decoration = await this.calculateRoomDecoration(channel);

            LogService.info("MixerBridge", `Creating room for ${suffix} (${channel.channelId})`);
            const roomObj = {
                preset: "public_chat",
                visibility: "public",
                name: decoration.name,
                topic: decoration.topic ? decoration.topic : "",
                initial_state: [
                    {
                        type: "m.room.avatar",
                        state_key: "",
                        content: {
                            url: decoration.avatarUrl ? decoration.avatarUrl : "",
                        },
                    },
                    {
                        type: "io.t2bot.mixer.channel",
                        state_key: "",
                        content: {
                            channelId: channel.channelId,
                        }
                    },
                    {
                        type: "im.vector.modular.widgets",
                        state_key: "mixer",
                        content: {
                            id: "mixer", // Matches state_key
                            type: "m.custom",
                            url: `https://mixer.com/embed/player/${suffix}?muted=true`,
                            name: "Mixer",
                            waitForIframeLoad: true,
                            data: {
                                title: suffix,
                                channelId: channel.channelId,
                                channelName: suffix,
                            },
                        },
                    }
                ],
                power_level_content_override: {
                    ban: 50,
                    events_default: 0,
                    invite: 0,
                    kick: 50,
                    redact: 50,
                    state_default: 100,
                    users_default: 0,
                    users: {
                        [this.appservice.botIntent.userId]: 100,
                    },
                    events: {
                        "m.room.name": 100,
                        "m.room.power_levels": 100,
                        "m.room.history_visibility": 100,
                        "m.room.canonical_alias": 50,
                        "m.room.avatar": 100,
                    },
                    notifications: {
                        room: 50,
                    },
                },
            };
            await createRoomFn(roomObj);
            this.startChannel(roomObj['__roomId'], channel.channelId);
        } catch (e) {
            LogService.error("MixerBridge", e);
            return createRoomFn(false);
        }
    }
}
