import { filter } from 'rxjs';
import { Lock } from './models/lock.model';
import { LockState } from './models/lock-state';
import { LoqedPlatform } from './loqed.platform';
import { LoqedService } from './services/loqed.service';
import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';
import { LoqedStatus } from './models/loqed-status.model';

export class LockMechanismeAccessory {
    private lockMechanismeService: Service;
    private batteryService: Service;
    private loqedService: LoqedService;

    private lock: Lock;

    private state = {
        current: LockState.Unknown,
        target: LockState.Unknown,
        batteryPercentage: -1
    };

    private minBatteryLevel = 20;

    constructor(
        private readonly platform: LoqedPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.lock = accessory.context.device as Lock;

        this.loqedService = new LoqedService(
            this.platform.log,
            this.platform.config.apiKey!,
            this.platform.config.apiToken!,
            this.platform.config.webhookPort,
            this.lock.oldLockId,
            this.lock.lockId);

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Fabian de Groot')
            .setCharacteristic(this.platform.Characteristic.Model, 'Loqed')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, '12-34-56-78');

        this.lockMechanismeService = this.accessory.getService(this.platform.Service.LockMechanism) || this.accessory.addService(this.platform.Service.LockMechanism);
        this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery);

        this.loqedService.lockStatus$
            .pipe(
                filter(x => x?.id === this.lock.lockId)
            )
            .subscribe(status => this.processLoqedStatusUpdate(status));

        this.loqedService.startPolling(this.lock.statePollingFrequencyInMinutes);

        this.lockMechanismeService.setCharacteristic(this.platform.Characteristic.Name, this.lock.name);

        this.lockMechanismeService.getCharacteristic(this.platform.Characteristic.LockTargetState)
            .on('set', this.setLockTargetState.bind(this))
            .on('get', this.getLockTargetState.bind(this));

        this.lockMechanismeService.getCharacteristic(this.platform.Characteristic.LockCurrentState)
            .on('get', this.getLockCurrentState.bind(this));
    }

    setLockTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
        const newTargetState = value === this.platform.Characteristic.LockTargetState.UNSECURED
            ? LockState.Unlocked
            : LockState.Locked;

        if (newTargetState === this.state.target) {
            return;
        }

        this.platform.log.debug('Updating target state from', LockState[this.state.target], 'to', LockState[newTargetState]);
        this.state.target = newTargetState;

        this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockTargetState,
            this.state.target === LockState.Unlocked
                ? this.platform.Characteristic.LockTargetState.UNSECURED
                : this.platform.Characteristic.LockTargetState.SECURED
        );

        this.loqedService.toggle(this.state.target);

        if (this.platform.config.webhookPort) {
            // set the state manually if the webhook hasn't reported the lock closed in N seconds
            setTimeout(() => {
                if (this.state.current !== this.state.target) {
                    this.platform.log.debug('Manually updating current state from', LockState[this.state.current], 'to', LockState[this.state.target]);
                    this.state.current = this.state.target;
                    this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
                        this.state.target === LockState.Unlocked
                            ? this.platform.Characteristic.LockCurrentState.UNSECURED
                            : this.platform.Characteristic.LockCurrentState.SECURED
                    );
                }
            }, 10000);
        }
        else {
            // set current state after N seconds if no webhook port is configured
            setTimeout(() => {
                this.platform.log.debug('Updating current state from', LockState[this.state.current], 'to', LockState[this.state.target]);
                this.state.current = this.state.target;
                this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
                    this.state.target === LockState.Unlocked
                        ? this.platform.Characteristic.LockCurrentState.UNSECURED
                        : this.platform.Characteristic.LockCurrentState.SECURED
                );
            }, 5000);
        }

        callback(null);
    }

    getLockCurrentState(callback: CharacteristicGetCallback): void {
        this.platform.log.debug('Get Characteristic LockCurrentState ->', LockState[this.state.current]);
        callback(null, this.state.current === LockState.Unlocked
            ? this.platform.Characteristic.LockCurrentState.UNSECURED
            : this.platform.Characteristic.LockCurrentState.SECURED
        );
    }

    getLockTargetState(callback: CharacteristicGetCallback): void {
        this.platform.log.debug('Get Characteristic LockTargetState ->', LockState[this.state.target]);
        callback(null, this.state.target === LockState.Unlocked
            ? this.platform.Characteristic.LockTargetState.UNSECURED
            : this.platform.Characteristic.LockTargetState.SECURED
        );
    }

    processLoqedStatusUpdate(status: LoqedStatus | null): void {
        if (!status) {
            return;
        }

        this.platform.log.info('Received status update', JSON.stringify(status));
        this.platform.log.info('Received status update to', LockState[status.state]);

        if (this.state.current !== status.state && (status.state === LockState.Unlocked || status.state === LockState.Locked)) {
            this.platform.log.info('Updating current state from', LockState[this.state.current], 'to', LockState[status.state]);
            this.state.current = status.state;
            this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
                status.state === LockState.Unlocked
                    ? this.platform.Characteristic.LockCurrentState.UNSECURED
                    : this.platform.Characteristic.LockCurrentState.SECURED
            );

            // also "correct" the target state if the lock state change came from another app or manually
            if (this.state.target !== status.state) {
                this.platform.log.info('Correcting target state from', LockState[this.state.target], 'to', LockState[status.state]);
                this.state.target = status.state;
                this.lockMechanismeService.updateCharacteristic(this.platform.Characteristic.LockTargetState,
                    status.state === LockState.Unlocked
                        ? this.platform.Characteristic.LockTargetState.UNSECURED
                        : this.platform.Characteristic.LockTargetState.SECURED
                );
            }
        }

        // first status update should also set the target state
        if (this.state.target === LockState.Unknown) {
            this.state.target = this.state.current;
        }

        if (this.state.batteryPercentage !== status.battery_percentage) {
            this.platform.log.info('Updating battery level from', this.state.batteryPercentage, 'to', status.battery_percentage);
            this.state.batteryPercentage = status.battery_percentage;
            this.batteryService.updateCharacteristic(this.platform.Characteristic.BatteryLevel, status.battery_percentage);
            this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, status.battery_percentage <= this.minBatteryLevel);
        }
    }
}