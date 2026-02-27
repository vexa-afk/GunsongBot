const originalSetTimeout = global.setTimeout;
global.setTimeout = (callback, delay, ...args) => {
    if (typeof delay === 'number' && delay < 0) delay = 1;
    return originalSetTimeout(callback, delay, ...args);
};

const { Client } = require("discord.js-selfbot-v13");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType,
    NoSubscriberBehavior
} = require("@discordjs/voice");
const fs = require("fs");
const path = require("path");
const config = require("./Config/Config.js");

try {
    const ffmpeg = require('ffmpeg-static');
    process.env.FFMPEG_PATH = ffmpeg;
} catch (e) {
    console.error("FFMPEG-STATIC Error");
}

const client = new Client({ checkUpdate: false });
const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
});

let connection;
let isLooping = false;
let isSpamming = false;
let autoEmojiTarget = null;
let targetEmoji = null;
let isGroupMode = false;
const musicPath = path.join(__dirname, "Music", "music.mp3");

// --- [ 헬퍼 함수 ] ---
function playMusic() {
    if (!fs.existsSync(musicPath)) { isLooping = false; return; }
    const resource = createAudioResource(fs.createReadStream(musicPath), {
        inputType: StreamType.Arbitrary,
        inlineVolume: false
    });
    player.play(resource);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getShuffledWords = () => (config.BAD_WORDS?.length > 0 ? [...config.BAD_WORDS].sort(() => Math.random() - 0.5) : ["내용 없음"]);

const formatContent = (target, content) => {
    const v = "\n".repeat(15);
    const z = "\u200b";
    const header = target ? `${target}${v}` : ""; 
    return `${header}${z}A${v}${z}A${v}${z}A${v}# ${content}`;
};

// --- [ 이벤트 리스너 ] ---
player.on(AudioPlayerStatus.Idle, () => { if (isLooping) playMusic(); });
player.on('error', () => { if (isLooping) setTimeout(playMusic, 1000); });

client.on("ready", () => {
    console.log(`[+] 로그온 완료: ${client.user.tag}`);
    if (config.STATUS) {
        client.user.setActivity(config.STATUS, { type: "PLAYING" });
    }
});

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    if (isGroupMode && msg.author.id === client.user.id && !msg.content.startsWith(config.PREFIX)) {
        if (msg.channel.type === 'GROUP_DM' || msg.channel.setName) {
            try { await msg.channel.setName(msg.content); } catch (e) {}
        }
    }

    if (autoEmojiTarget && msg.author.id === autoEmojiTarget && targetEmoji) {
        try { await msg.react(targetEmoji); } catch (e) {}
    }

    if (msg.author.id === client.user.id) {
        if (!msg.content.startsWith(config.PREFIX)) return;

        const args = msg.content.slice(config.PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // --- [ .help 명령어: 세로 나열 방식 ] ---
        if (command === "help") {
            const h = `\`\`\`ansi
[1;34m[ CONTROL ][0m
┕ .stop - 모든 동작 중지 및 초기화
┕ .group - 그룹 이름 자동 변경 모드 토글
┕ .나가기 - 현재 서버 나가기
┕ .닉네임 [이름] - 내 서버 닉네임 변경

[1;31m[ ATTACK ][0m
┕ .spam [@유저] - 랜덤 단어로 10회 공격
┕ .kill [@유저] [내용] - 지정 문구로 10회 공격
┕ .도배 [내용] - 딜레이 없이 10번 즉시 전송
┕ .테러 [개수] [내용] - 포맷팅 적용 대량 전송
┕ .이모지 @유저 이모지 - 타겟 메시지에 자동 반응
┕ .복제 @유저 - 타겟의 프사와 닉네임 복사
┕ .강제답장 [ID] [내용] - 특정 메시지에 답장 도배

[1;32m[ VOICE & INFO ][0m
┕ .loop [채널ID] - 음성 채널 접속 및 음악 반복
┕ .서버정보 - 현재 서버의 상세 정보 출력
┕ .유저정보 @유저 - 해당 유저의 정보 확인
┕ .프사 @유저 - 유저의 프로필 사진 링크 전송

[1;33m[ UTILS ][0m
┕ .상태 [내용] - 내 상태 메시지 변경
┕ .삭제 [개수] - 최근 내가 쓴 메시지 삭제
┕ .모두삭제 - 내 메시지 100개 찾아 삭제
┕ .청소 - 화면을 깨끗하게 밀어버림
┕ .계산 [식] - 수학 수식 계산
┕ .핑 - 현재 지연 시간 확인
┕ .검색 [단어] - 구글 검색 링크 생성
┕ .초대 - 현재 채널 초대 코드 생성
┕ .임베드 [내용] - 강조된 박스 형태로 전송
┕ .시간 - 현재 실시간 날짜/시간
┕ .주사위 - 1~100 랜덤 주사위 굴리기
\`\`\``;
            await msg.edit(h).catch(() => msg.channel.send(h));
        }

        // --- [ 기존 및 추가 기능 로직 ] ---

        if (command === "group") { isGroupMode = !isGroupMode; await msg.delete().catch(() => {}); }
        
        if (command === "stop") {
            isLooping = false; isSpamming = false; autoEmojiTarget = null; targetEmoji = null; isGroupMode = false;
            player.stop();
            if (connection) { connection.destroy(); connection = null; }
            client.user.setPresence({ activities: [] });
            await msg.delete().catch(() => {});
        }

        if (command === "spam") {
            const target = msg.mentions.users.first();
            isSpamming = true;
            let words = getShuffledWords();
            for (let i = 0; i < 10; i++) {
                if (!isSpamming) break;
                if (words.length === 0) words = getShuffledWords();
                await msg.channel.send(formatContent(target, words.shift())).catch(() => { isSpamming = false; });
                await sleep(2500);
            }
            isSpamming = false;
        }

        if (command === "kill") {
            const target = msg.mentions.users.first();
            const killContent = target ? args.slice(1).join(" ") : args.join(" ");
            if (!killContent) return;
            isSpamming = true;
            for (let i = 0; i < 10; i++) {
                if (!isSpamming) break;
                await msg.channel.send(formatContent(target, killContent)).catch(() => { isSpamming = false; });
                await sleep(2500);
            }
            isSpamming = false;
        }

        if (command === "도배") {
            const content = args.join(" ") || "도배";
            await msg.delete().catch(() => {});
            for (let i = 0; i < 10; i++) msg.channel.send(content).catch(() => {});
        }

        if (command === "테러") {
            const count = parseInt(args[0]) || 5;
            const content = args.slice(1).join(" ") || "TERROR";
            await msg.delete().catch(() => {});
            for (let i = 0; i < count; i++) {
                await msg.channel.send(formatContent(null, content)).catch(() => {});
                await sleep(1500);
            }
        }

        if (command === "이모지") {
            const target = msg.mentions.users.first();
            if (!target || !args[1]) return;
            autoEmojiTarget = target.id;
            targetEmoji = args[1];
            await msg.delete().catch(() => {});
        }

        if (command === "loop") {
            const channelId = args[0];
            let vc = channelId ? await client.channels.fetch(channelId).catch(() => null) : msg.member?.voice?.channel;
            if (!vc || !vc.isVoice()) return;
            if (connection) connection.destroy();
            connection = joinVoiceChannel({
                channelId: vc.id, guildId: vc.guild.id,
                adapterCreator: vc.guild.voiceAdapterCreator,
                selfDeaf: true, group: client.user.id
            });
            connection.subscribe(player);
            try {
                await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
                isLooping = true; playMusic();
            } catch (e) { if (connection) connection.destroy(); }
        }

        if (command === "삭제") {
            const num = parseInt(args[0]) || 5;
            await msg.delete().catch(() => {});
            const msgs = await msg.channel.messages.fetch({ limit: 100 });
            const mine = msgs.filter(m => m.author.id === client.user.id).first(num);
            for (const m of mine) { await m.delete().catch(() => {}); await sleep(500); }
        }

        if (command === "모두삭제") {
            const msgs = await msg.channel.messages.fetch({ limit: 100 });
            const mine = msgs.filter(m => m.author.id === client.user.id);
            await msg.delete().catch(() => {});
            for (const m of mine.values()) { await m.delete().catch(() => {}); await sleep(300); }
        }

        if (command === "계산") {
            try { const result = eval(args.join(" ")); await msg.channel.send(`**결과:** \`${result}\``); } 
            catch (e) { await msg.channel.send("⚠️"); }
        }

        if (command === "핑") await msg.edit(`🏓 \`${client.ws.ping}ms\``);
        
        if (command === "상태") {
            client.user.setActivity(args.join(" "), { type: "PLAYING" });
            await msg.delete().catch(() => {});
        }

        if (command === "청소") await msg.channel.send("ﾠ\n".repeat(60) + "```\nCLEANED\n```");

        if (command === "서버정보") {
            if (!msg.guild) return;
            await msg.edit(`\`\`\`\n[ 서버명: ${msg.guild.name} ]\n[ ID: ${msg.guild.id} ]\n[ 멤버수: ${msg.guild.memberCount}명 ]\n[ 생성일: ${msg.guild.createdAt.toLocaleDateString()} ]\n\`\`\``);
        }

        if (command === "유저정보") {
            const user = msg.mentions.users.first() || msg.author;
            await msg.edit(`\`\`\`\n[ 유저명: ${user.tag} ]\n[ ID: ${user.id} ]\n[ 가입일: ${user.createdAt.toLocaleDateString()} ]\n\`\`\``);
        }

        if (command === "프사") {
            const user = msg.mentions.users.first() || msg.author;
            await msg.edit(`${user.displayAvatarURL({ dynamic: true, size: 1024 })}`);
        }

        if (command === "닉네임") {
            const nick = args.join(" ");
            if (msg.guild && nick) {
                await msg.guild.members.me.setNickname(nick).catch(() => {});
                await msg.delete().catch(() => {});
            }
        }

        if (command === "복제") {
            const target = msg.mentions.users.first();
            if (!target) return;
            await client.user.setAvatar(target.displayAvatarURL()).catch(() => {});
            if (msg.guild) await msg.guild.members.me.setNickname(target.username).catch(() => {});
            await msg.delete().catch(() => {});
        }

        if (command === "검색") {
            const query = args.join("+");
            await msg.edit(`🔍 https://www.google.com/search?q=${query}`);
        }

        if (command === "초대") {
            const invite = await msg.channel.createInvite({ maxAge: 0 }).catch(() => null);
            await msg.edit(invite ? `🔗 ${invite.url}` : "❌ 권한 부족");
        }

        if (command === "임베드") {
            const text = args.join(" ");
            await msg.edit(`\`\`\`fix\n${text}\n\`\`\``);
        }

        if (command === "시간") {
            await msg.edit(`⏰ 현재 시간: \`${new Date().toLocaleString()}\``);
        }

        if (command === "주사위") {
            const rand = Math.floor(Math.random() * 100) + 1;
            await msg.edit(`🎲 결과: \`${rand}\``);
        }

        if (command === "나가기") {
            if (!msg.guild) return;
            await msg.edit("👋 서버를 나갑니다.");
            await msg.guild.leave();
        }

        if (command === "강제답장") {
            const targetId = args[0];
            const content = args.slice(1).join(" ") || "답장 도배";
            if (!targetId) return;
            for (let i = 0; i < 5; i++) {
                await msg.channel.send({ content: content, reply: { messageReference: targetId } }).catch(() => {});
                await sleep(1000);
            }
        }
    }
});

client.login(config.TOKEN);