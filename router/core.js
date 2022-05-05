const config = require('../config/configs');
const log = require('../tools/log');
const express = require('express');
const fs = require('fs')


module.exports = class {
    constructor(systemdata, cache){
        this.systemdata = systemdata;
        this.cache = cache;
        this.app = express();
        this.app.use(express.json());

        if(config.router.ssl.enabled){
            const https = require('https');
            const httpsOptions = {
                key: fs.readFileSync(config.router.ssl.key),
                cert: fs.readFileSync(config.router.ssl.cert)
            }
            this.httpsServer = https.createServer(httpsOptions, this.app);
        }

        //start app on ports 80 and 443
        this.app.listen(config.router.port, () => {
            log("sysOK", null, "router");
        });


        if(config.router.ssl.enabled)
        {
            this.httpsServer.listen(config.router.ssl.port, () => {
                log("sysOK", null, "router/ssl");
            })
        }

        this.register()
    }

    register()
    {
        this.app.get('/', async (req, res) => {

            if(config.router.ssl.enforce) if(req.protocol !== 'https') return res.redirect("https://" + req.headers.host + req.url); 

            var host = req.get('host');
            var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress 
            if(config.router.ignoreWWW) host = host.replace("www.", "");

            log("connection", `${host} requested by ${ip}`, "router");

            //check wether the requested host has an index.html file
            if(!fs.existsSync(`./www/${host}/index.html`)) return res.status(404).sendFile("404.html", { root: `./www/static` }), log("debug", `404 - ${ip} requested ${host} but it doesn't have a index file`, "router");


            res.sendFile("index.html", { root: `./www/${host}` }), log("debug", `${ip} requested ${req.originalUrl} of ${host}`, "router", { url: req.originalUrl, host: host, ip: ip });
            
        });

        this.app.all('*', async (req, res) => {

            var host = req.get('host');
            var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress 

            if(!host.includes("cdn")) if(config.router.ssl.enforce) if(req.protocol !== 'https') return res.redirect("https://" + req.headers.host + req.url); 

            if(config.router.ignoreWWW) host = host.replace("www.", "");
            if(req.originalUrl.endsWith("/")) req.originalUrl = req.originalUrl.slice(0, -1);

            log("connection", `${host}${req.originalUrl} requested by ${ip}`, "router");
            
            const route = this.cache.get('routes', host)
            if(route) {
                try {
                    let url = req.originalUrl.replaceAll("/", "_")
                    let target = eval(`route.${url}`)
                    if(target) return res.redirect(target), log("debug", `${ip} was redirected from ${req.originalUrl} to ${target} of ${host}`, "router");
                } catch(e) {  }
            }

            //check wether the requested file exists. If it doesn't exist, send a 404 status
            if(!fs.existsSync(`./www/${host}${req.originalUrl}`)) return res.status(404).sendFile("404.html", { root: `./www/static` }), log("debug", `404 - ${ip} tried to view ${req.originalUrl} but it doesn't exist`, "router", { url: req.originalUrl, host: host, ip: ip });
            
            //check wether the requested url is a directory
            if(fs.lstatSync(`./www/${host}${req.originalUrl}`).isDirectory()) return res.status(404).sendFile("getFile.html", { root: `./www/static` }), log("debug", `404 - ${ip} received the index finder`, "router", { url: req.originalUrl, host: host, ip: ip });



            res.sendFile(req.originalUrl, { root: `./www/${host}` }), log("debug", `${ip} requested ${req.originalUrl} of ${host}`, "router", { url: req.originalUrl, host: host, ip: ip });
            
        });


        this.app.use((err, req, res, next) => {
            if(`${err}`.includes("no such file or directory")) return res.sendFile("404.html", { root: `./www/static` }), console.log(`${err}`) 
        });
    }
}