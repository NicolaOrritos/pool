
var static = require("node-static");
var http   = require("http");
var url    = require("url");

var files  = new static.Server("./files");
var errors = new static.Server("./errors");


function askBagarino(req, callback)
{
    if (req)
    {
        var data = url.parse(req.url, true);
        
        if (data.query.ticket)
        {
            var ticket = data.query.ticket;
            
            var options = {
                host: "localhost",
                port: 8124,
                path: "/tickets/" + ticket + "/status"
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
            
            http.request(options, bagarinoCallback).end();
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

function serveContent(req, res)
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
}


http.createServer(function(req, res)
{
    req.addListener("end", serveContent).resume();
    
}).listen(8080, function()
{
    console.log("pool server started");
});
