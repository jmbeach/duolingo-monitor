import Sequelize from "sequelize"
export class MonitorRecord {
    static create(sequelize) {
        return sequelize.define('MonitorRecord', {
            DeckUrl: {
                type: Sequelize.STRING,
                field: 'DeckUrl',
                primaryKey: true
            },
            LastNotified: {
                type: Sequelize.DATE,
                field: 'LastNotified'
            }
        }, {
            timestamps: false
        })
    }
}