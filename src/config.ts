import * as config from "config";

interface IConfig {
    appservice: {
        domainName: string;
        homeserverUrl: string;
        asToken: string;
        hsToken: string;
        senderLocalpart: string;
        userPrefix: string;
        aliasPrefix: string;
    };
    mixer: {
        token: string;
        clientId: string;
    };
    web: {
        bindAddress: string;
        bindPort: number;
    };
    database: {
        misc: string;
    };
}

export default <IConfig>config;
