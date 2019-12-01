import { Appservice, LogService } from "matrix-bot-sdk";
import MixerClient, { MixerChannel } from "./MixerClient";
import config from "./config";
import MixerStream from "./MixerStream";

export default class MixerBridge {
    private defaultMixer: MixerClient;
    private channels: { [roomId: number]: MixerStream } = {};

    constructor(private appservice: Appservice) {
        appservice.on("query.room", this.onQueryAlias.bind(this));
        appservice.on("query.user", () => false); // disable user queries
        appservice.on("room.join", (roomId, ev) => this.startChannel(roomId));

        this.defaultMixer = new MixerClient(config.mixer.token, config.mixer.clientId);
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

    private async startChannel(roomId: string) {
        if (this.channels[roomId]) return;
        try {
            const ident = await this.appservice.botClient.getRoomStateEvent(roomId, "io.t2bot.mixer.channel", "");
            if (!ident || !ident['channelId']) throw new Error("Invalid channel identity event");
            const channelId = ident['channelId'];
            LogService.info("MixerBridge", `Bridging ${channelId} to ${roomId}`);
            this.channels[roomId] = new MixerStream(this.defaultMixer, this.appservice, this, channelId, roomId);
            await this.channels[roomId].start();
        } catch (e) {
            LogService.warn("MixerBridge", e);
        }
    }

    public calculateRoomDecoration(channelInfo: MixerChannel): { name: string, topic: string, avatarUrl: string } {
        // TODO: Flag room as live streaming
        const name = `${channelInfo.username}: ${channelInfo.name}`;
        const topic = channelInfo.description;
        const avatarUrl = ""; // TODO: Upload avatar if needed

        return {name, topic, avatarUrl};
    }

    private async onQueryAlias(roomAlias: string, createRoomFn: (roomCreationContent) => null): Promise<any> {
        try {
            const suffix = this.appservice.getSuffixForAlias(roomAlias);
            const channel = await this.defaultMixer.getChannel(suffix);
            if (!channel) return createRoomFn(false);

            const decoration = this.calculateRoomDecoration(channel);

            LogService.info("MixerBridge", `Creating room for ${suffix} (${channel.channelId})`);
            createRoomFn({
                preset: "public_chat",
                visibility: "public",
                name: decoration.name,
                topic: decoration.topic,
                initial_state: [
                    {
                        type: "m.room.avatar",
                        state_key: "",
                        content: {
                            url: decoration.avatarUrl,
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
            });
        } catch (e) {
            LogService.error("MixerBridge", e);
            return createRoomFn(false);
        }
    }
}
