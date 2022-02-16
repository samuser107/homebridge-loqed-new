import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { LockMechanismeAccessory } from './lock-mechanisme.accessory';
import { Config } from './models/config.model';
import { Lock } from './models/lock.model';

export class LoqedPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
    public readonly accessories: PlatformAccessory[] = [];

    public readonly config: Config;

    constructor(
        public readonly log: Logger,
        config: Config,
        public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform Loqed');

        this.config = Object.assign(new Config(), config, {
            locks: config.locks?.map(x => new Lock(x)),
        });

        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');

            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);

        this.accessories.push(accessory);
    }

    discoverDevices() {
        if (!this.config.locks) {
            this.log.warn('No locks configured');
            return;
        }

        for (const lock of this.config.locks) {
            const lockUuid = this.api.hap.uuid.generate(lock.lockId);
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === lockUuid);

            if (existingAccessory) {
                this.log.info('Restoring existing accessory from cache:', lock.name);
                existingAccessory.context.device = lock;
                new LockMechanismeAccessory(this, existingAccessory);
            }
            else {
                this.log.info('Adding new accessory:', lock.name);
                const accessory = new this.api.platformAccessory(lock.name, lockUuid);
                accessory.context.device = lock;
                new LockMechanismeAccessory(this, accessory);

                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }

        // remove old locks
        for (let i = this.accessories.length - 1; i >= 0; i--) {
            const accessory = this.accessories[i];
            const lock = this.config.locks?.find(p => this.api.hap.uuid.generate(p.lockId) === accessory.UUID);

            if (!lock) {
                this.log.info('Removing existing accessory from cache:', accessory.displayName);
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                this.accessories.splice(i, 1);
            }
        }
    }

    private deleteAllCachedAccesories() {
        for (let i = this.accessories.length - 1; i >= 0; i--) {
            const accessory = this.accessories[i];
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
    }
}