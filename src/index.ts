import {
    Appservice,
    IAppserviceOptions,
    IAppserviceRegistration,
    LogService,
    RichConsoleLogger,
    SimpleFsStorageProvider,
    SimpleRetryJoinStrategy
} from "matrix-bot-sdk";
import config from "./config";
import MixerBridge from "./MixerBridge";

LogService.setLogger(new RichConsoleLogger());
LogService.info("index", "Starting up...");

const registration: IAppserviceRegistration = {
    as_token: config.appservice.asToken,
    hs_token: config.appservice.hsToken,
    sender_localpart: config.appservice.senderLocalpart,
    namespaces: {
        users: [{
            regex: `@${config.appservice.userPrefix}_.*`,
            exclusive: true,
            groupId: null,
        }],
        rooms: [],
        aliases: [{
            regex: `#${config.appservice.aliasPrefix}_.*`,
            exclusive: true,
        }],
    },
};

const storage = new SimpleFsStorageProvider(config.database.misc);

const options: IAppserviceOptions = {
    bindAddress: config.web.bindAddress,
    port: config.web.bindPort,
    homeserverName: config.appservice.domainName,
    homeserverUrl: config.appservice.homeserverUrl,
    storage: storage,
    registration: registration,
    joinStrategy: new SimpleRetryJoinStrategy(),
};

const appservice = new Appservice(options);
const bridge = new MixerBridge(appservice);
bridge.start().then(() => LogService.info("index", "Bridge started"));
