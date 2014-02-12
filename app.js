
console.log("pool server starting...\n");

var static = require("node-static");
var https  = require("https");
var http   = require("http");
var url    = require("url");
var sjl    = require("sjl");
var fs     = require("fs");



var defaults = {
    "ENVIRONMENT": "production",
    
    "FILES": {
        "POOL_PATH": "./files",
        "ERRORS_PATH": "./errors"
    },
    
    "SERVER_TYPE": {
        "HTTPS": {
            "ENABLED": true,
            "KEY":  "private/key.pem",
            "CERT": "private/cert.crt",
            "PORT": 4443
        },
        "HTTP": {
            "ENABLED": false,
            "PORT": 8080
        }
    },
    
    "LOGGING": {
        "ENABLED": true,
        "PATH": "/var/log"
    },
    
    "BAGARINO": {
        "TYPE": "https",
        "HOSTNAME": "localhost",
        "PORT": 8443,
        "HTTPS_KEY_PATH": "private/key.pem",
        "HTTPS_CERT_PATH": "private/cert.crt"
    }
};

var CONF = sjl("/etc/pool.conf", defaults);


var files  = new static.Server(CONF.FILES.POOL_PATH);
var errors = new static.Server(CONF.FILES.ERRORS_PATH);



function askBagarino(req, callback)
{
    if (req)
    {
        var data = url.parse(req.url, true);
        
        if (data.query.ticket)
        {
            var ticket = data.query.ticket;
            
            var options = {
                host: CONF.BAGARINO.HOSTNAME,
                port: CONF.BAGARINO.PORT,
                path: "/tickets/" + ticket + "/status",
                // key:  fs.readFileSync(CONF.BAGARINO.HTTPS_KEY_PATH, "utf8").toString(),
                // cert: fs.readFileSync(CONF.BAGARINO.HTTPS_CERT_PATH, "utf8").toString(),
                rejectUnauthorized: false
            };

            var bagarinoCallback = function(response)
            {
                var str = "";
                
                response.on("data", function(chunk)
                {
                    str += chunk;
                });

                response.on("end", function()
                {
                    var json = JSON.parse(str);
                    
                    console.log("Bagarino's answer: '%s'", str);

                    var result = (json.status == "VALID");

                    if (callback)
                    {
                        callback.call(this, undefined, result);
                    }
                });
            };

            console.log("Going to ask bagarino web-service for ticket '%s' validity...", ticket);
            
            if (CONF.BAGARINO.TYPE == "https")
            {
                https.request(options, bagarinoCallback).end();
            }
            else
            {
                http.request(options, bagarinoCallback).end();
            }
        }
        else if (callback)
        {
            callback.call(this, "No ticket parameter", false);
        }
    }
    else if (callback)
    {
        callback.call(this, "Empty request", false);
    }
}



if (CONF.SERVER_TYPE.HTTP.ENABLED)
{
    http.createServer(function(req, res)
    {
        req.addListener("end", function(stream)
        {
            // 1. Ask bagarino about the validity of this ticket
            askBagarino(req, function(err, result)
            {
                var isOK = false;

                if (err)
                {
                    console.log("An error occurred evaluating this request. %s", err);
                }
                else
                {
                    isOK = result;
                }

                if (isOK)
                {
                    // 2a. Serve the content if everything went well
                    files.serve(req, res);

                    console.log("Everything is OK. Answering request '%s'...", req.url);
                }
                else
                {
                    // 2b. Serve an error otherwise
                    errors.serveFile("403.json", 403, {}, req, res);

                    console.log("Could not answer '%s' request positively", req.url);
                }
            });
        }).resume();

    }).listen(CONF.SERVER_TYPE.HTTP.PORT, function()
    {
        console.log("\npool HTTP server started on port %d\n", CONF.SERVER_TYPE.HTTP.PORT);
    });
}

if (CONF.SERVER_TYPE.HTTPS.ENABLED)
{
    var privateKey  = fs.readFileSync(CONF.SERVER_TYPE.HTTPS.KEY,  "utf8");
    var certificate = fs.readFileSync(CONF.SERVER_TYPE.HTTPS.CERT, "utf8");
    
    var credentials = {key: privateKey, cert: certificate};
    
    https.createServer(credentials, function(req, res)
    {
        req.addListener("end", function(stream)
        {
            // 1. Ask bagarino about the validity of this ticket
            askBagarino(req, function(err, result)
            {
                var isOK = false;

                if (err)
                {
                    console.log("An error occurred evaluating this request. %s", err);
                }
                else
                {
                    isOK = result;
                }

                if (isOK)
                {
                    // 2a. Serve the content if everything went well
                    files.serve(req, res);

                    console.log("Everything is OK. Answering request '%s'...", req.url);
                }
                else
                {
                    // 2b. Serve an error otherwise
                    errors.serveFile("403.json", 403, {}, req, res);

                    console.log("Could not answer '%s' request positively", req.url);
                }
            });
        }).resume();

    }).listen(CONF.SERVER_TYPE.HTTPS.PORT, function()
    {
        console.log("\npool HTTPS server started on port %d\n", CONF.SERVER_TYPE.HTTPS.PORT);
    });
}


