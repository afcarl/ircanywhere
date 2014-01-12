Application = function() {
	"use strict";

	var _ = require('lodash'),
		hooks = require('hooks'),
		winston = require('winston'),
		os = require('os'),
		fs = require('fs'),
		raw = fs.readFileSync('./private/config.json').toString(),
		path = require('path'),
		jsonminify = require('jsonminify'),
		validate = require('simple-schema'),
		mongo = require('mongo-sync').Server;

	var schema = {
		'mongo': {
			type: 'string',
			required: true
		},
		'reverseDns': {
			type: 'string',
			required: true
		},
		'enableRegistrations': {
			type: 'boolean',
			required: true
		},
		'ssl': {
			type: 'boolean',
			required: false
		},
		'forkProcess': {
			type: 'boolean',
			required: true
		},
		'email': {
			type: 'object',
			required: true
		},
		'email.forceValidation': {
			type: 'boolean',
			required: true
		},
		'email.siteName': {
			type: 'string',
			required: false
		},
		'email.from': {
			type: 'string',
			required: true
		},
		'clientSettings': {
			type: 'object',
			required: true
		},
		'clientSettings.networkLimit': {
			type: 'number',
			min: 1,
			max: 10,
			required: true
		},
		'clientSettings.networkRestriction': {
			type: 'string',
			required: false
		},
		'clientSettings.userNamePrefix': {
			type: 'string',
			required: true
		},
		'defaultNetwork': {
			type: 'object',
			required: true
		},
		'defaultNetwork.server': {
			type: 'string',
			required: true
		},
		'defaultNetwork.port': {
			type: 'number',
			min: 1,
			max: 65535,
			required: true
		},
		'defaultNetwork.realname': {
			type: 'string',
			required: true
		},
		'defaultNetwork.secure': {
			type: 'boolean',
			required: false
		},
		'defaultNetwork.password': {
			type: 'string',
			required: false
		},
		'defaultNetwork.channels': {
			type: 'array',
			required: false
		},
		'defaultNetwork.channels.$.channel': {
			type: 'string',
			required: true,
			regEx: /([#&][^\x07\x2C\s]{0,200})/
		},
		'defaultNetwork.channels.$.password': {
			type: 'string',
			required: false
		}
	};

	var App = {
		init: function() {
			this.config = JSON.parse(jsonminify(raw));
			validate(this.config, schema);
			// attempt to validate our config file

			this.mongo = new mongo('127.0.0.1').db('ircanywhere');

			App.Nodes = this.mongo.getCollection('nodes');
			App.Networks = this.mongo.getCollection('networks');
			App.Tabs = this.mongo.getCollection('tabs');
			App.ChannelUsers = this.mongo.getCollection('channelUsers');
			App.Events = this.mongo.getCollection('events');
			App.Commands = this.mongo.getCollection('commands');

			App.setupWinston();
			App.setupNode();
			// next thing to do if we're all alright is setup our node
			// this has been implemented now in the way for clustering
		},

		setupWinston: function() {
			this.logger = new (winston.Logger)({
				transports: [
					new (winston.transports.Console)(),
					new (winston.transports.File)({
						name: 'error',
						level: 'error',
						filename: './logs/error.log',
						json: false,
						timestamp: true
					}),
					new (winston.transports.File)({
						name: 'warn',
						level: 'warn',
						filename: './logs/warn.log',
						json: false,
						timestamp: true
					}),
					new (winston.transports.File)({
						name: 'info',
						level: 'info',
						filename: './logs/info.log',
						json: false,
						timestamp: true
					})
				]
			});
		},

		setupNode: function() {
			var data = '',
				json = {},
				query = {_id: null},
				ipAddr = (process.env.IP_ADDR) ? process.env.IP_ADDR : '0.0.0.0',
				port = (process.env.PORT) ? process.env.PORT : 3000,
				defaultJson = {
					endpoint: (this.config.ssl) ? 'https://' + ipAddr + ':' + port : 'http://' + ipAddr + ':' + port,
					hostname: os.hostname(),
					reverseDns: this.config.reverseDns,
					port: process.env.PORT,
					ipAddress: ipAddr
				};

			try {
				data = fs.readFileSync('./private/node.json', {encoding: 'utf8'});
				json = JSON.parse(data);
				query = new mongo.ObjectId(json.nodeId);
			} catch (e) {
				json = defaultJson;
			}

			var node = this.Nodes.find(query).toArray();
			if (node.length > 0) {
				this.Nodes.update(query, defaultJson, {safe: false});
				json = defaultJson;
				json.nodeId = node._id;
			} else {
				var nodeId = App.Nodes.insert(defaultJson, {safe: false});
				
				json = defaultJson;
				json.nodeId = nodeId._id;
			}

			this.nodeId = json.nodeId;

			if (data === JSON.stringify(json)) {
				return false;
			}

			fs.writeFile('./private/node.json', JSON.stringify(json), function(err) {
				if (err) {
					throw err;
				} else {
					App.logger.info('Node settings saved in private/node.json. Server might restart, it\'s advised not to edit or delete this file unless instructed to do so by the developers');
				}
			});
		}
	};

	App.init();
	// initiate the module if need be

	return _.extend(App, hooks);
};

exports.Application = Application;