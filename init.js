const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
config = require('./config.json');

const server = new https.createServer(
    {
        cert: fs.readFileSync(config.certificate),
        key: fs.readFileSync(config.key),
        requestCert: false,
        rejectUnauthorized: false
    });

const wss = new WebSocket.Server({ server });

function outLog(message)
{
    var dateFormat = require('dateformat');
    console.log(dateFormat(new Date(), "yyyy-dd-mm hh:MM:ss") + ': ' + message);
}

lastConnectionID = 0;

wss
    .on('connection', function connection(ws)
    {
        outLog('New connection. ' + wss.clients.size + ' connection(s) on server side');

        ws.isAlive = true;
        ws.userID = null;

        ws
            .on('close', function ()
            {
                outLog('User ' + (ws.userID ? ws.userID : '<guest>') + ' has disconnected. ' + wss.clients.size + ' connection(s) on server side');
            })
            .on('message', function (message)
            {
                message = JSON.parse(message);

                if (!ws.userID && message.type.toString() !== 'login')
                {
                    outLog('Message from unauthorized user. Connection closed');
                    ws.terminate();
                    return 0;
                }

                switch (message.type)
                {
                    case 'login':
                        var credentials = message.credentials;

                        credentials = Buffer.from(credentials, 'base64');
                        if (!credentials || !credentials.length)
                        {
                            outLog('Try to login with incorrect credentials. Connection closed');
                            ws.terminate();
                            return 0;
                        }

                        var crypto = require('crypto');
                        var iv = Buffer.alloc(16);
                        var decryptor = crypto.createDecipheriv(config.decipherivMethod, config.decipherivSecret, iv);
                        credentials = decryptor.update(credentials, 'base64', 'utf8') + decryptor.final('utf8');
                        if (!credentials || !credentials.length)
                        {
                            outLog('Try to login with incorrect credentials. Connection closed');
                            ws.terminate();
                            return 0;
                        }

                        credentials = JSON.parse(credentials);
                        if (!credentials || typeof credentials !== 'object' || !credentials.hasOwnProperty('id_user'))
                        {
                            outLog('Try to login with incorrect credentials. Connection closed');
                            ws.terminate();
                            return 0;
                        }
                        ws.userID = credentials.id_user;
                        ws.send(JSON.stringify({type: 'login', data: 'ok'}));
                        outLog('User with id=' + ws.userID + ' successful login');
                        break;

                    case 'notify-users-new-message':
                        outLog('User ' + ws.userID + ' send a message to a chat ' + message.id_chat);

                        wss.clients.forEach(function(client)
                        {
                            if (message.users_to_notify.indexOf(client.userID) > -1)
                                client.send(JSON.stringify({type: 'message-added', id_chat: message.id_chat}));
                        });
                        break;

                    case 'notify-message-readed':
                        outLog('User ' + ws.userID + ' read all messages in a chat ' + message.id_chat);

                        wss.clients.forEach(function(client)
                        {
                            if (message.users_to_notify.indexOf(client.userID) > -1)
                                client.send(JSON.stringify({type: 'message-readed', id_chat: message.id_chat}));
                        });
                        break;

                    default:
                        outLog('User ' + ws.userID + ' send an unrecognized command (' + message.type + ')');
                        break;
                }
            })
            .on('error', function()
            {
                outLog('Error user ' + (ws.userID ? ws.userID : '<guest>') + '. Connection closed');
            })
            .on('pong', function()
            {
                ws.isAlive = true;
            });
    });

setInterval(function()
{
    wss.clients.forEach(function (client)
    {
        if (!client.isAlive) return client.terminate();

        client.isAlive = false;
        client.ping(null, false, true);
    });
}, 10000);

server.listen(8080);
outLog('started');