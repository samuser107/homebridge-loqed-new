import { BridgeConfiguration, PlatformConfig } from 'homebridge';
import { Lock } from './lock.model';

export class Config implements PlatformConfig {
    [x: string]: unknown;
    platform!: string;
    name?: string | undefined;
    _bridge?: BridgeConfiguration | undefined;

    apiKey?: string;
    apiToken?: string;
    locks?: Lock[];
    webhookPort?: number;
}