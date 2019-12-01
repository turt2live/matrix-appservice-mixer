import { Appservice, Intent } from "matrix-bot-sdk";
import * as LRU from "lru-cache";

export default class MediaCache {
    private cache = new LRU({max: 1000, maxAge: 5 * 60 * 1000});
    private botIntent: Intent;

    public constructor(private appservice: Appservice) {
        this.botIntent = appservice.botIntent;
    }

    public async uploadFromUrl(url: string, intent: Intent = null): Promise<string> {
        if (!this.cache.has(url)) {
            try {
                const existing = await this.botIntent.underlyingClient.getAccountData("io.t2bot.media." + url);
                if (existing && existing['mxc']) {
                    return existing['mxc'];
                }
            } catch (e) {
                // Assume not present
            }

            // Not in memory cache or in bot cache - upload and cache
            const mxc = await (intent ? intent : this.botIntent).underlyingClient.uploadContentFromUrl(url);
            await this.botIntent.underlyingClient.setAccountData("io.t2bot.media." + url, {mxc});
            this.cache.set(url, mxc);
            return mxc;
        }

        return this.cache.get(url);
    }
}
