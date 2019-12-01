import MixerClient from "./MixerClient";
import { Appservice, Intent, LogService, MentionPill } from "matrix-bot-sdk";
import * as Mixer from "@mixer/client-node";
import * as ws from "ws";
import * as escapeHtml from "escape-html";
import MixerBridge from "./MixerBridge";

export default class MixerStream {

    constructor(
        private client: MixerClient,
        private appservice: Appservice,
        private bridge: MixerBridge,
        private channelId: number,
        private roomId: string,
    ) {
        //
    }

    public async start() {
        LogService.info(`MixerStream@${this.channelId}`, `Joining stream: ${this.channelId}`);
        const chatDetails = <any>(await this.client.mixerChatService.join(this.channelId)).body;
        const socket = new Mixer.Socket(ws, chatDetails.endpoints).boot();

        // This can happen async - things will queue up
        socket.auth(this.channelId, this.client.mixerUserId, chatDetails.authkey).catch(err => {
            LogService.error(`MixerStream@${this.channelId}`, "Error connecting to stream:");
            LogService.error(`MixerStream@${this.channelId}`, err);
        });

        socket.on('error', err => {
            LogService.error(`MixerStream@${this.channelId}`, "Error with stream:");
            LogService.error(`MixerStream@${this.channelId}`, err);
        });

        socket.on('ChatMessage', async (data: Mixer.IChatMessage) => {
            const intent = this.appservice.getIntentForSuffix(data.user_name);
            await intent.ensureRegistered();
            await this.updateProfileFor(intent, data); // update profile before join
            await intent.ensureJoined(this.roomId);
            await this.bridgeMessage(intent, data);
        });

        await this.updateRoom();
    }

    private async updateRoom() {
        const channelInfo = await this.client.getChannel(this.channelId);
        const decoration = this.bridge.calculateRoomDecoration(channelInfo);
        const powerLevels = {
            ban: 50,
            events_default: 0,
            invite: 0,
            kick: 50,
            redact: 50,
            state_default: 100,
            users_default: 0,
            users: {
                [this.appservice.botIntent.userId]: 100,
                // TODO: Find moderators and put them in here
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
        };
        const name = {
            name: decoration.name,
        };
        const avatar = {
            url: decoration.avatarUrl,
        };
        const topic = {
            topic: decoration.topic,
        };
        // const widget = {
        //     type: "im.vector.modular.widgets",
        //     state_key: "mixer",
        //     content: {
        //         id: "mixer", // Matches state_key
        //         type: "m.custom",
        //         url: `https://mixer.com/embed/player/${channelInfo.username}?muted=true`,
        //         name: "Mixer",
        //         waitForIframeLoad: true,
        //         data: {
        //             title: channelInfo.username,
        //             channelId: this.channelId,
        //             channelName: channelInfo.username,
        //         },
        //     },
        // };

        await this.appservice.botClient.sendStateEvent(this.roomId, "m.room.power_levels", "", powerLevels);
        await this.appservice.botClient.sendStateEvent(this.roomId, "m.room.name", "", name);
        await this.appservice.botClient.sendStateEvent(this.roomId, "m.room.avatar", "", avatar);
        await this.appservice.botClient.sendStateEvent(this.roomId, "m.room.topic", "", topic);
    }

    private async bridgeMessage(intent: Intent, data: Mixer.IChatMessage) {
        if (data.message.meta.whisper) {
            LogService.warn(`MixerStream@${this.channelId}`, `Discarding whisper from ${data.user_id}`);
            return;
        }

        let assembledHtml = "";
        let assembledText = "";

        for (const part of data.message.message) {
            if (part.type === 'text') {
                assembledHtml += escapeHtml(part.text);
                assembledText += part.text;
            } else if (part.type === 'emoticon') {
                // TODO: Import emoji fully
                assembledHtml += escapeHtml(part.text);
                assembledText += part.text;
            } else if (part.type === 'link') {
                assembledHtml += `<a href="${escapeHtml(part.url)}">${escapeHtml(part.text)}</a>`;
                assembledText += part.url;
            } else if (part.type === 'tag') {
                const victimIntent = this.appservice.getIntentForSuffix(part.username);
                const pill = await MentionPill.forUser(victimIntent.userId, this.roomId, intent.underlyingClient);
                assembledHtml += pill.html;
                assembledText += pill.text;
            } else {
                LogService.warn(`MixerStream@${this.channelId}`, `Unknown message type: ${(<any>part).type}`);
                assembledHtml += escapeHtml((<any>part).text);
                assembledText += (<any>part).text;
            }
        }

        const msgtype = data.message.meta.me ? "m.emote" : "m.text";
        return intent.sendEvent(this.roomId, {
            msgtype,
            format: "org.matrix.custom.html",
            formatted_body: assembledHtml,
            body: assembledText,
        });
    }

    private async updateProfileFor(intent: Intent, data: Mixer.IChatMessage) {
        try {
            const profile = await intent.underlyingClient.getUserProfile(intent.userId);
            try {
                const avatarUrl = (<any>data).user_avatar;
                if (avatarUrl) {
                    // TODO: Cache URL:MXC maps
                    const mxc = await intent.underlyingClient.uploadContentFromUrl(avatarUrl);
                    await intent.underlyingClient.setAvatarUrl(mxc);
                }
            } catch (e) {
                LogService.warn(`MixerStream@${this.channelId}`, `Failed to set avatar for ${data.user_id}`);
                LogService.warn(`MixerStream@${this.channelId}`, e);
            }

            try {
                if (data.user_name && profile['displayname'] !== data.user_name) {
                    await intent.underlyingClient.setDisplayName(data.user_name);
                }
            } catch (e) {
                LogService.warn(`MixerStream@${this.channelId}`, `Failed to set display name for ${data.user_id}`);
                LogService.warn(`MixerStream@${this.channelId}`, e);
            }
        } catch (e) {
            LogService.warn(`MixerStream@${this.channelId}`, `Failed to handle profile for ${data.user_id}`);
            LogService.warn(`MixerStream@${this.channelId}`, e);
        }
    }
}
