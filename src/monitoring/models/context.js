import {MonitorRecord} from './monitor-record'

function create(sequelize) {
    var monitorRecord = MonitorRecord.create(sequelize)
    return {
        MonitorRecord: monitorRecord
    }
}

module.exports.create = create