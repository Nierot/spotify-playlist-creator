const SpotifyWebApi = require('spotify-web-api-node')
const secrets = require('./secrets.json')
const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');
const pug = require('pug');
const { clearInterval } = require('timers');
const sqlite3 = require('sqlite3').verbose();
const sqlite = require('sqlite');

app.use(cors());
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

const port = 7000;
const redirectUri = 'http://api.nierot.com/playlist/callback';//'http://localhost:7000/playlist/callback';//
let spotify;
let playlist;
let adtje;
let db;

function authorizeSpotify() {
    var scopes = ['user-modify-playback-state', 'playlist-modify-public', 'user-read-playback-state', 'user-read-currently-playing', 'app-remote-control', 'streaming']
    return spotify.createAuthorizeURL(scopes);
}

function refreshToken() {
    console.log("Refreshing the token")
    spotify.refreshAccessToken().then(
        data => {
            spotify.setAccessToken(data.body['access_token'])
            console.log(data.body['access_token'])
        }, err => {
            console.log(err)
        }
    )
}

async function resumeShuffle() {
    length = await getPlaylistLength();
    console.log(`Length: ${length}`)
    spotify.play({
        context_uri: 'spotify:playlist:' + playlist,
        offset: { 'position': Math.floor(Math.random() * length) + 1 }
    }).then(
        data => console.log(data),
        err => console.log(err)
    );
    toggleShuffle();
}

async function getPlaylistLength() {
    length = 1;
    await spotify.getPlaylist(playlist).then(
        data => length = data.body.tracks.total,
        err => console.log('getPlaylistLength() ' + err)
    );
    return length;
}

async function isSongInPlaylist(song, playlist) {
    if (song.includes('spotify')) {
        song = song.split(':')[2];
    }
    console.log(`Looking for ${song}`)
    let tracks = [];
    let length = await getPlaylistLength();
    if (length > 80) {
        let arr = Array(Math.ceil(length/80))
        for (let part of arr.keys()) {
            //console.log(part);
            await spotify.getPlaylistTracks(
                playlist,
                { 
                    fields: 'items',
                    offset: part*80
                }
                ).then(
                data => {
                    for (let y in data.body.items) {
                        tracks.push(data.body.items[y]);
                    }
                },
                err => console.log(err)
            )
        }
    }
    let success = false;
    console.log(tracks.length)
    for (let x in tracks) {
        //console.log(`Looking for: ${song}. Got: ${tracks[x].track.id}. ${tracks[x].track.id === song}`)
        if (song === tracks[x].track.id) {
            success = true;
        }
    }
    console.log('In playlist: ' + success)
    return success;
}

async function getCurrentlyPlaying() {
    let x = {};
    await spotify.getMyCurrentPlaybackState({}).then(
        data => x = data,
        err => x = err
    ).catch(err => x = err);
    return x;
}

async function getSong(song_id) {
    let x = {};
    await spotify.getTrack(song_id).then(
        data => x = data,
        err => x = err
    ).catch(err => x = err);
    return x.body;
}

async function getSongImage(song_id) {
    let x = await getSong(song_id);
    return x.album.images[0].url;
}

async function toggleShuffle(shuffle) {
    let x = {};
    await spotify.setShuffle({
        state: 'true'
    }).then(
        data => x = data,
        err => x = err
    )
    return x;
}

async function tijdVoorBier(pl) {
    console.log("Tijd voor bier");
    if (playlist === undefined) {
        return 400;
    }
    playlist = pl;
    let x = {};
    await spotify.play({
        uris: ['spotify:track:2bJaewMbxlwnm69zvOAq3s']
    }).then(
        data => x = data,
        err => x = err
    ).then(
        setTimeout(resumeShuffle, 197000) // Song is 198 seconds long
    )
    console.log(x)
    return x;
}

async function adtjeVoordeSfeer(min, max, playlist) {
    var intervalFunction = () => {
        console.log(playlist);
        tijdVoorBier(playlist);
        let interval = (Math.floor(Math.random() * (max - min + 1)) + min) * 1000// Generates a random number between 1800 and 3600
        console.log(`Adtje voor de sfeer na ${interval} milliseconden`)
        adtje = setInterval(intervalFunction, interval);
    }
    intervalFunction();
}

async function addSongToDatabase(song, user, username) {
    if (username === undefined) {
        username = user;
    }
    let success = false;
    db.run('INSERT INTO songs(song, user, username) VALUES(?,?,?)', [song, user, username], err => {
        if (err) console.log(`err: ${err.message}`)
        else success = true;
    });
    return success;
}

async function whoDidThis(song) {
    let user = 'Anonymous';
    const res = await db.get('SELECT * FROM songs WHERE song = ?', [`spotify:track:${song}`])
    if (res !== undefined) {
        user = res.username;
    }
    return user;
}

app.get('/playlist/', async (req, res) => {
    if (spotify.getAccessToken()) {
        let pils = false;
        let interval = '';
        if (req.query.pils) {
            let min = 1800;
            let max = 3600;
            interval = `Tussen ${min} en ${max} seconden`;
            console.log("Tijd voor bier!")
            if (!req.query.playlist) {
                return res.send("playlist missing");
            }
            if (req.query.min) {
                min = req.query.min;
            }
            if (req.query.max) {
                max = req.query.max;
            }
            pils = true;
            if (!req.query.refresh && adtje) adtjeVoordeSfeer(min, max, req.query.playlist);
        }
        let x = await getCurrentlyPlaying();
        let song = await getSong(x.body.item.id);
        let img = await getSongImage(x.body.item.id);
        let artist = song.artists[0].name;
        let title = x.body.item.name;
        let user = `Toegevoegd door: ${await whoDidThis(x.body.item.id)}`;
        if (pils) {
            pils = '<i class="fa fa-beer" aria-hidden="true"></i>'
        } else {
            pils = ''
        }
        res.render("index", {
            img: img,
            title: title,
            artist: artist,
            pils: pils,
            interval: interval,
            user: user
        });
    } else {
        res.send(`<a href=${authorizeSpotify()}>Login</a>`)
    }
});

app.get('/playlist/callback', (req, res) => {
    console.log(req.query.code)
    spotify.authorizationCodeGrant(req.query.code).then(
        data => {
            spotify.setAccessToken(data.body['access_token'])
            spotify.setRefreshToken(data.body['refresh_token'])
            res.send(data.body['access_token'])
        }, err => {
            console.log(err)
        }
    )
})

app.get('/playlist/refresh', (req, res) => {
    refreshToken();
    res.send(spotify.getAccessToken())
});

app.get('/playlist/add', async (req, res) => {
    if (req.query.user === undefined || req.query.song === undefined || req.query.playlist === undefined) {
        return res.status(400).send('Bad request');
    }
    playlist = req.query.playlist;
    let inPlaylist = await isSongInPlaylist(req.query.song, req.query.playlist)
    console.log(inPlaylist);
    if (inPlaylist === true) {
        return res.status(400).send("Already in playlist!")
    }
    spotify.addTracksToPlaylist(req.query.playlist, [req.query.song]).then(
        data => res.status(200).send(data),
        err => res.status(500).send(err)
    ).then(() => {
        addSongToDatabase(req.query.song, req.query.user, req.query.username);
    });
})

app.get('/playlist/play', (req, res) => {
    if (req.query.song === undefined) {
        return res.status(400).send('Bad request');
    }
    spotify.play({
        uris: [req.query.song]
    }).then(
        data => res.send(data),
        err => res.send(err)
    )
})

app.get('/playlist/playing', (req, res) => {
    spotify.getMyCurrentPlaybackState({}).then(
        data => res.send(data),
        err => res.send(err)
    );
});

app.get('/playlist/pause', (req, res) => {
    spotify.pause().then(
        data => res.send(data),
        err => res.send(err)
    )
    res.send('oof')
});

app.get('/playlist/tijdvoorbier', async (req, res) => {
    playlist = req.query.playlist;
    let status = tijdVoorBier(req.query.playlist);
    if (status === 400) {
        return res.status(400).send('Bad request');
    }
    return res.send(status);
});

app.get('/playlist/inplaylist', async (req, res) => {
    if (req.query.song === undefined || req.query.playlist === undefined) {
        return res.status(400).send("Bad request");
    }
    res.send(await isSongInPlaylist(req.query.song, req.query.playlist))
});

app.listen(port, async () => {
    spotify = new SpotifyWebApi({
        redirectUri: redirectUri,
        clientId: secrets['clientId'],
        clientSecret: secrets['clientSecret']
    });
    db = await sqlite.open({
        filename: './data.db',
        driver: sqlite3.Database
    })
    console.log(`Listening on http://localhost:${port}`);
    db.run('CREATE TABLE IF NOT EXISTS songs(song text, user text, username text, UNIQUE(song))')
    setInterval(refreshToken, 50 * 60 * 1000); // Every 50 minutes it refreshes the token
});