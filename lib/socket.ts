import { Server, Socket } from "socket.io";
import fs from "fs";
import path from "path";

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

interface SocketMeta {
  username: string;
  room: string;
}

interface RegisterPayload {
  username: string;
  testBlob: EncryptedPayload;
}

interface RoomRecord {
  id: string;
  title: string;
  messages: StoredMessage[];
  members: string[];
  owner: string;
  isPrivate: boolean;
  createdAt: number;
}

interface StoredMessage {
  id: string;
  sender: string;
  timestamp: number;
  ciphertext: string;
  iv: string;
}

interface SendPayload extends EncryptedPayload {
  type: "chat" | "video";
  sender: string;
}

interface CreateRoomPayload {
  id: string;
  title: string;
  username: string;
}

interface InvitePayload {
  roomId: string;
  invitee: string;
  username: string;
}

interface AdminCmdPayload {
  cmd: string;
  args: string[];
  username: string;
  room: string;
}

export interface Db {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
  del?: (key: string) => void;
}

const roomKey = (id: string) => `room:${id}`;
const userKey = (name: string) => `user:${name}`;
const ROOMS_INDEX = "rooms:index";

const bannedIPs = new Set<string>();
const bannedUsers = new Set<string>();
const mutedUsers = new Set<string>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
const lockedRooms = new Set<string>();
const slowmodes = new Map<string, number>();
const lastMessageTime = new Map<string, number>();
const warnings = new Map<string, string[]>();
const pinnedMessages = new Map<string, string>();
const modLogs: { ts: number; admin: string; action: string }[] = [];
const runtimeAdmins = new Set<string>();
const serverStart = Date.now();

const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 60_000;
const chatRateBuckets = new Map<string, { count: number; reset: number }>();

function checkChatRate(username: string): { ok: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const bucket = chatRateBuckets.get(username);
  if (!bucket || bucket.reset <= now) {
    chatRateBuckets.set(username, { count: 1, reset: now + CHAT_RATE_WINDOW_MS });
    return { ok: true, retryAfter: 0, remaining: CHAT_RATE_LIMIT - 1 };
  }
  if (bucket.count >= CHAT_RATE_LIMIT) {
    return { ok: false, retryAfter: Math.ceil((bucket.reset - now) / 1000), remaining: 0 };
  }
  bucket.count++;
  return { ok: true, retryAfter: 0, remaining: CHAT_RATE_LIMIT - bucket.count };
}

function loadAdmins(): Set<string> {
  try {
    const p = path.resolve(process.cwd(), "api/admins.json");
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    return new Set([...(data.admins ?? []), ...Array.from(runtimeAdmins)]);
  } catch {
    return new Set(Array.from(runtimeAdmins));
  }
}

function checkAdmin(username: string): boolean {
  return loadAdmins().has(username);
}

function addLog(admin: string, action: string) {
  modLogs.push({ ts: Date.now(), admin, action });
  if (modLogs.length > 200) modLogs.splice(0, modLogs.length - 200);
}

function getRooms(db: Db, username: string): RoomRecord[] {
  const index: string[] = db.get(ROOMS_INDEX) ?? [];
  return index
    .map((id) => db.get(roomKey(id)) as RoomRecord | undefined)
    .filter((r): r is RoomRecord => !!r)
    .filter((room) => room.id === "general" || room.members.includes(username));
}

function getAllRooms(db: Db): RoomRecord[] {
  const index: string[] = db.get(ROOMS_INDEX) ?? [];
  return index
    .map((id) => db.get(roomKey(id)) as RoomRecord | undefined)
    .filter((r): r is RoomRecord => !!r);
}

function saveRoom(db: Db, room: RoomRecord) {
  const index: string[] = db.get(ROOMS_INDEX) ?? [];
  if (!index.includes(room.id)) db.set(ROOMS_INDEX, [...index, room.id]);
  db.set(roomKey(room.id), room);
}

function ensureDefaultRoom(db: Db) {
  if (!db.get(roomKey("general"))) {
    saveRoom(db, {
      id: "general",
      title: "general",
      messages: [],
      members: [],
      owner: "",
      isPrivate: false,
      createdAt: Date.now(),
    });
  }
}

const socketMeta: Record<string, SocketMeta> = {};
const userSockets: Record<string, string> = {};

export function setUpIO(io: Server, db: Db): void {
  if (!db.get || !db.set) {
    console.error("you must have a db getter and setter!!");
    return;
  }

  ensureDefaultRoom(db);

  io.on("connection", (socket: Socket) => {
    const ip =
      (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      socket.handshake.address;

    if (bannedIPs.has(ip)) {
      socket.emit("banned", "You are banned from this server.");
      socket.disconnect(true);
      return;
    }

    let user: string;

    socket.on("check-user", (username: string) => {
      if (bannedUsers.has(username)) {
        socket.emit("banned", "Your account has been banned.");
        return;
      }
      const record = db.get(userKey(username));
      socket.emit(record ? "user-exists" : "user-not-found", record);
    });

    socket.on("register", (data: RegisterPayload) => {
      if (db.get(userKey(data.username))) { socket.emit("reg-fail", "Username taken"); return; }
      db.set(userKey(data.username), { username: data.username, testBlob: data.testBlob });
      socket.emit("reg-ok");
      console.log("Registered:", data.username);
    });

    socket.on("auth-ok", ({ username }: { username: string }) => {
      user = username;
      userSockets[username] = socket.id;
      socket.emit("auth-ok", { username, isAdmin: checkAdmin(username) });
      socket.emit("rooms", getRooms(db, user));
      console.log("Authenticated:", username);
    });

    socket.on("get-rooms", () => {
      if (user) socket.emit("rooms", getRooms(db, user));
    });

    socket.on("create-room", ({ id, title, username }: CreateRoomPayload) => {
      if (db.get(roomKey(id))) { socket.emit("room-fail", "Room already exists"); return; }
      saveRoom(db, {
        id,
        title,
        messages: [],
        members: [username],
        owner: username,
        isPrivate: true,
        createdAt: Date.now(),
      });
      socket.emit("rooms", getRooms(db, username));
      console.log("Room created:", id, "by", username);
    });

    socket.on("delete-room", ({ id, username }: { id: string; username: string }) => {
      if (id === "general") { socket.emit("room-fail", "Cannot delete general"); return; }
      const rec: RoomRecord | undefined = db.get(roomKey(id));
      if (!rec) { socket.emit("room-fail", "Room not found"); return; }
      if (rec.owner !== username) { socket.emit("room-fail", "Only the room owner can delete this room"); return; }
      const index: string[] = db.get(ROOMS_INDEX) ?? [];
      db.set(ROOMS_INDEX, index.filter((r) => r !== id));
      if (db.del) db.del(roomKey(id)); else db.set(roomKey(id), null);
      socket.emit("rooms", getRooms(db, username));
    });

    socket.on("invite-user", ({ roomId, invitee, username }: InvitePayload) => {
      const rec: RoomRecord | undefined = db.get(roomKey(roomId));
      if (!rec) { socket.emit("invite-fail", "Room not found"); return; }
      if (rec.owner !== username) { socket.emit("invite-fail", "Only the room owner can invite users"); return; }
      if (!db.get(userKey(invitee))) { socket.emit("invite-fail", `User "${invitee}" not found`); return; }
      if (!rec.members.includes(invitee)) {
        rec.members.push(invitee);
        saveRoom(db, rec);
      }
      socket.emit("invite-ok", { roomId, invitee });
      const inviteeSocketId = userSockets[invitee];
      if (inviteeSocketId) {
        io.to(inviteeSocketId).emit("rooms", getRooms(db, invitee));
      }
      console.log(`${username} invited ${invitee} to room "${roomId}"`);
    });

    socket.on("join-room", ({ username, room }: SocketMeta) => {
      const rec: RoomRecord | undefined = db.get(roomKey(room));

      if (rec && rec.isPrivate && !rec.members.includes(username)) {
        socket.emit("room-fail", "You are not a member of this room");
        return;
      }

      const prev = socketMeta[socket.id];
      if (prev?.room) {
        socket.leave(prev.room);
        io.to(prev.room).emit("room-count", io.sockets.adapter.rooms.get(prev.room)?.size ?? 0);
      }

      socketMeta[socket.id] = { username, room };
      socket.join(room);

      if (rec && !rec.members.includes(username) && !rec.isPrivate) {
        rec.members.push(username);
        saveRoom(db, rec);
      }

      io.to(room).emit("room-count", io.sockets.adapter.rooms.get(room)?.size ?? 0);
    });

    socket.on("send", (data: SendPayload) => {
      const meta = socketMeta[socket.id];
      if (!meta) return;

      if (data.type === "chat") {
        if (mutedUsers.has(data.sender)) return;
        if (lockedRooms.has(meta.room) && !checkAdmin(data.sender)) return;

        if (!checkAdmin(data.sender)) {
          const rl = checkChatRate(data.sender);
          if (!rl.ok) {
            socket.emit("rate-limited", { retryAfter: rl.retryAfter, remaining: rl.remaining });
            return;
          }
        }

        const slow = slowmodes.get(meta.room);
        if (slow) {
          const last = lastMessageTime.get(data.sender) ?? 0;
          if (Date.now() - last < slow * 1000) return;
          lastMessageTime.set(data.sender, Date.now());
        }

        const rec: RoomRecord | undefined = db.get(roomKey(meta.room));
        if (rec) {
          rec.messages.push({
            id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            sender: data.sender,
            timestamp: Date.now(),
            ciphertext: data.ciphertext,
            iv: data.iv,
          });
          if (rec.messages.length > 500) rec.messages = rec.messages.slice(-500);
          saveRoom(db, rec);
        }
        io.to(meta.room).emit("msg", data);
      } else if (data.type === "video") {
        socket.to(meta.room).emit("msg", data);
      }
    });

    socket.on("admin-cmd", ({ cmd, args, username, room }: AdminCmdPayload) => {
      if (!checkAdmin(username)) {
        socket.emit("cmd-result", { ok: false, msg: "Unauthorized." });
        return;
      }

      const ok = (msg: string) => socket.emit("cmd-result", { ok: true, msg });
      const err = (msg: string) => socket.emit("cmd-result", { ok: false, msg });
      const sysRoom = (text: string, target: string) => io.to(target).emit("system-msg", { text });
      const sysAll = (text: string) => getAllRooms(db).forEach((r) => io.to(r.id).emit("system-msg", { text }));

      switch (cmd) {
        case "ban": {
          const target = args[0];
          if (!target) { err("Usage: ?ban <user>"); break; }
          bannedUsers.add(target);
          const sid = userSockets[target];
          if (sid) {
            const s = io.sockets.sockets.get(sid);
            if (s) {
              const tIP = (s.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || s.handshake.address;
              if (tIP) bannedIPs.add(tIP);
            }
            io.to(sid).emit("banned", "You have been banned.");
            io.sockets.sockets.get(sid)?.disconnect(true);
          }
          addLog(username, `ban ${target}`);
          ok(`Banned ${target} (username + IP if online)`);
          break;
        }

        case "unban": {
          const target = args[0];
          if (!target) { err("Usage: ?unban <user>"); break; }
          bannedUsers.delete(target);
          addLog(username, `unban ${target}`);
          ok(`Unbanned ${target}`);
          break;
        }

        case "banip": {
          if (username.toLowerCase() !== "kq7z") { err("Unauthorized."); break; }
          const targetIP = args[0];
          if (!targetIP) { err("Usage: ?banip <ip>"); break; }
          bannedIPs.add(targetIP);
          addLog(username, `banip ${targetIP}`);
          ok(`IP banned: ${targetIP}`);
          break;
        }

        case "unbanip": {
          if (username.toLowerCase() !== "kq7z") { err("Unauthorized."); break; }
          const targetIP = args[0];
          if (!targetIP) { err("Usage: ?unbanip <ip>"); break; }
          bannedIPs.delete(targetIP);
          addLog(username, `unbanip ${targetIP}`);
          ok(`IP unbanned: ${targetIP}`);
          break;
        }

        case "getip": {
          if (username.toLowerCase() !== "kq7z") { err("Unauthorized."); break; }
          const target = args[0];
          if (!target) { err("Usage: ?getip <user>"); break; }
          const sid = userSockets[target];
          if (!sid) { err(`${target} is not online`); break; }
          const s = io.sockets.sockets.get(sid);
          if (!s) { err("Socket not found"); break; }
          const tIP = (s.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || s.handshake.address;
          ok(`IP of ${target}: ${tIP}`);
          break;
        }

        case "mute": {
          const target = args[0];
          if (!target) { err("Usage: ?mute <user>"); break; }
          mutedUsers.add(target);
          addLog(username, `mute ${target}`);
          ok(`Muted ${target}`);
          sysRoom(`[Admin] ${target} has been muted`, room);
          break;
        }

        case "unmute": {
          const target = args[0];
          if (!target) { err("Usage: ?unmute <user>"); break; }
          mutedUsers.delete(target);
          if (timeouts.has(target)) { clearTimeout(timeouts.get(target)!); timeouts.delete(target); }
          addLog(username, `unmute ${target}`);
          ok(`Unmuted ${target}`);
          sysRoom(`[Admin] ${target} has been unmuted`, room);
          break;
        }

        case "muteall": {
          const online = Object.keys(userSockets).filter((u) => !checkAdmin(u));
          online.forEach((u) => mutedUsers.add(u));
          sysAll("[Admin] All non-admin users have been muted.");
          addLog(username, "muteall");
          ok(`Muted ${online.length} users`);
          break;
        }

        case "unmuteall": {
          mutedUsers.clear();
          timeouts.forEach((t) => clearTimeout(t));
          timeouts.clear();
          sysAll("[Admin] All users have been unmuted.");
          addLog(username, "unmuteall");
          ok("All users unmuted");
          break;
        }

        case "kick": {
          const target = args[0];
          if (!target) { err("Usage: ?kick <user>"); break; }
          const sid = userSockets[target];
          if (sid) {
            io.to(sid).emit("kicked", "You have been kicked from the server.");
            io.sockets.sockets.get(sid)?.disconnect(true);
          }
          addLog(username, `kick ${target}`);
          ok(`Kicked ${target}`);
          break;
        }

        case "warn": {
          const [target, ...reasonParts] = args;
          if (!target) { err("Usage: ?warn <user> <reason>"); break; }
          const reason = reasonParts.join(" ") || "No reason given";
          const list = warnings.get(target) ?? [];
          list.push(`[${new Date().toISOString()}] ${reason}`);
          warnings.set(target, list);
          addLog(username, `warn ${target}: ${reason}`);
          ok(`Warned ${target}: ${reason} (${list.length} total)`);
          const sid = userSockets[target];
          if (sid) io.to(sid).emit("system-msg", { text: `[Warning] You have been warned: ${reason}` });
          break;
        }

        case "warnings": {
          const target = args[0];
          if (!target) { err("Usage: ?warnings <user>"); break; }
          const list = warnings.get(target) ?? [];
          ok(list.length ? `Warnings for ${target}:\n${list.join("\n")}` : `No warnings for ${target}`);
          break;
        }

        case "clearwarns": {
          const target = args[0];
          if (!target) { err("Usage: ?clearwarns <user>"); break; }
          warnings.delete(target);
          addLog(username, `clearwarns ${target}`);
          ok(`Cleared warnings for ${target}`);
          break;
        }

        case "timeout": {
          const target = args[0];
          const minutes = parseInt(args[1] ?? "5");
          if (!target) { err("Usage: ?timeout <user> <minutes>"); break; }
          mutedUsers.add(target);
          if (timeouts.has(target)) clearTimeout(timeouts.get(target)!);
          timeouts.set(
            target,
            setTimeout(() => {
              mutedUsers.delete(target);
              timeouts.delete(target);
              const sid = userSockets[target];
              if (sid) io.to(sid).emit("system-msg", { text: "[System] Your timeout has expired." });
            }, minutes * 60_000),
          );
          addLog(username, `timeout ${target} ${minutes}m`);
          ok(`Timed out ${target} for ${minutes} minutes`);
          const tSid = userSockets[target];
          if (tSid) io.to(tSid).emit("system-msg", { text: `[Admin] You have been timed out for ${minutes} minutes.` });
          break;
        }

        case "untimeout": {
          const target = args[0];
          if (!target) { err("Usage: ?untimeout <user>"); break; }
          mutedUsers.delete(target);
          if (timeouts.has(target)) { clearTimeout(timeouts.get(target)!); timeouts.delete(target); }
          addLog(username, `untimeout ${target}`);
          ok(`Removed timeout for ${target}`);
          break;
        }

        case "view-channels":
        case "rooms": {
          const all = getAllRooms(db);
          const lines = all.map(
            (r) => `#${r.id} (${r.members.length} members, ${r.isPrivate ? "private" : "public"}${lockedRooms.has(r.id) ? ", locked" : ""})`,
          );
          ok(`Channels (${all.length}):\n${lines.join("\n")}`);
          break;
        }

        case "roominfo": {
          const target = args[0] || room;
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          const topic = pinnedMessages.get(`topic:${target}`) ?? "none";
          ok(
            [
              `#${rec.id}`,
              `Title: ${rec.title}`,
              `Owner: ${rec.owner || "none"}`,
              `Members: ${rec.members.length}`,
              `Messages: ${rec.messages.length}`,
              `Private: ${rec.isPrivate}`,
              `Locked: ${lockedRooms.has(target)}`,
              `Slowmode: ${slowmodes.get(target) ?? 0}s`,
              `Topic: ${topic}`,
            ].join("\n"),
          );
          break;
        }

        case "lock": {
          const target = args[0] || room;
          lockedRooms.add(target);
          addLog(username, `lock ${target}`);
          ok(`Locked #${target}`);
          sysRoom(`[Admin] #${target} has been locked.`, target);
          break;
        }

        case "unlock": {
          const target = args[0] || room;
          lockedRooms.delete(target);
          addLog(username, `unlock ${target}`);
          ok(`Unlocked #${target}`);
          sysRoom(`[Admin] #${target} has been unlocked.`, target);
          break;
        }

        case "lockall": {
          const all = getAllRooms(db);
          all.forEach((r) => lockedRooms.add(r.id));
          sysAll("[Admin] All channels have been locked.");
          addLog(username, "lockall");
          ok(`Locked ${all.length} rooms`);
          break;
        }

        case "unlockall": {
          lockedRooms.clear();
          sysAll("[Admin] All channels have been unlocked.");
          addLog(username, "unlockall");
          ok("All rooms unlocked");
          break;
        }

        case "slowmode": {
          const seconds = parseInt(args[0] ?? "0");
          const target = args[1] || room;
          if (seconds > 0) slowmodes.set(target, seconds); else slowmodes.delete(target);
          addLog(username, `slowmode ${target} ${seconds}s`);
          ok(seconds > 0 ? `Slowmode set to ${seconds}s in #${target}` : `Slowmode disabled in #${target}`);
          sysRoom(`[Admin] Slowmode ${seconds > 0 ? `set to ${seconds}s` : "disabled"} in #${target}.`, target);
          break;
        }

        case "clearroom":
        case "clearchat": {
          const target = args[0] || room;
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          rec.messages = [];
          saveRoom(db, rec);
          io.to(target).emit("clear-chat");
          addLog(username, `clearroom ${target}`);
          ok(`Cleared messages in #${target}`);
          break;
        }

        case "rename": {
          const [target, ...newNameParts] = args;
          const newName = newNameParts.join(" ");
          if (!target || !newName) { err("Usage: ?rename <room> <newname>"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          rec.title = newName;
          saveRoom(db, rec);
          Object.values(userSockets).forEach((sid) => {
            const s = io.sockets.sockets.get(sid);
            if (s) {
              const meta = socketMeta[sid];
              if (meta) s.emit("rooms", getRooms(db, meta.username));
            }
          });
          addLog(username, `rename ${target} -> ${newName}`);
          ok(`Renamed #${target} to "${newName}"`);
          break;
        }

        case "setprivate": {
          const target = args[0];
          if (!target) { err("Usage: ?setprivate <room>"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          rec.isPrivate = true;
          saveRoom(db, rec);
          addLog(username, `setprivate ${target}`);
          ok(`#${target} is now private`);
          break;
        }

        case "setpublic": {
          const target = args[0];
          if (!target) { err("Usage: ?setpublic <room>"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          rec.isPrivate = false;
          saveRoom(db, rec);
          addLog(username, `setpublic ${target}`);
          ok(`#${target} is now public`);
          break;
        }

        case "topic": {
          const [target, ...topicParts] = args;
          const topic = topicParts.join(" ");
          if (!target || !topic) { err("Usage: ?topic <room> <text>"); break; }
          pinnedMessages.set(`topic:${target}`, topic);
          sysRoom(`[Topic] ${topic}`, target);
          addLog(username, `topic ${target}: ${topic}`);
          ok(`Topic set for #${target}`);
          break;
        }

        case "resetroom": {
          const target = args[0];
          if (!target || target === "general") { err("Usage: ?resetroom <room> (cannot reset general)"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          rec.messages = [];
          rec.members = rec.owner ? [rec.owner] : [];
          saveRoom(db, rec);
          io.to(target).emit("clear-chat");
          addLog(username, `resetroom ${target}`);
          ok(`Reset #${target}`);
          break;
        }

        case "nuke": {
          const target = args[0];
          if (!target || target === "general") { err("Usage: ?nuke <room> (cannot nuke general)"); break; }
          const index: string[] = db.get(ROOMS_INDEX) ?? [];
          db.set(ROOMS_INDEX, index.filter((r) => r !== target));
          if (db.del) db.del(roomKey(target)); else db.set(roomKey(target), null);
          io.to(target).emit("system-msg", { text: "[Admin] This room has been deleted." });
          addLog(username, `nuke ${target}`);
          ok(`Nuked #${target}`);
          break;
        }

        case "members": {
          const target = args[0] || room;
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          ok(`Members of #${target} (${rec.members.length}): ${rec.members.join(", ") || "none"}`);
          break;
        }

        case "whois": {
          const target = args[0];
          if (!target) { err("Usage: ?whois <user>"); break; }
          const rec = db.get(userKey(target));
          const online = target in userSockets;
          const muted = mutedUsers.has(target);
          const banned = bannedUsers.has(target);
          const warnCount = warnings.get(target)?.length ?? 0;
          const admin = checkAdmin(target);
          ok(`${target}: ${rec ? "registered" : "not found"}, ${online ? "online" : "offline"}, muted=${muted}, banned=${banned}, warns=${warnCount}, admin=${admin}`);
          break;
        }

        case "addmember": {
          const [target, invitee] = args;
          if (!target || !invitee) { err("Usage: ?addmember <room> <user>"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          if (!rec.members.includes(invitee)) { rec.members.push(invitee); saveRoom(db, rec); }
          const sid = userSockets[invitee];
          if (sid) io.to(sid).emit("rooms", getRooms(db, invitee));
          addLog(username, `addmember ${invitee} -> ${target}`);
          ok(`Added ${invitee} to #${target}`);
          break;
        }

        case "removemember": {
          const [target, member] = args;
          if (!target || !member) { err("Usage: ?removemember <room> <user>"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          rec.members = rec.members.filter((m) => m !== member);
          saveRoom(db, rec);
          const sid = userSockets[member];
          if (sid) io.to(sid).emit("rooms", getRooms(db, member));
          addLog(username, `removemember ${member} from ${target}`);
          ok(`Removed ${member} from #${target}`);
          break;
        }

        case "transfer": {
          const [target, newOwner] = args;
          if (!target || !newOwner) { err("Usage: ?transfer <room> <user>"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          rec.owner = newOwner;
          if (!rec.members.includes(newOwner)) rec.members.push(newOwner);
          saveRoom(db, rec);
          addLog(username, `transfer ${target} -> ${newOwner}`);
          ok(`Transferred #${target} ownership to ${newOwner}`);
          break;
        }

        case "setowner": {
          const [target, newOwner] = args;
          if (!target || !newOwner) { err("Usage: ?setowner <room> <user>"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          rec.owner = newOwner;
          saveRoom(db, rec);
          addLog(username, `setowner ${target} -> ${newOwner}`);
          ok(`Set owner of #${target} to ${newOwner}`);
          break;
        }

        case "online": {
          const onlineUsers = Object.keys(userSockets);
          ok(`Online (${onlineUsers.length}): ${onlineUsers.join(", ") || "none"}`);
          break;
        }

        case "count": {
          const target = args[0] || room;
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          const socketCount = io.sockets.adapter.rooms.get(target)?.size ?? 0;
          ok(`#${target}: ${socketCount} connected, ${rec?.members.length ?? 0} members`);
          break;
        }

        case "dm": {
          const [target, ...msgParts] = args;
          const msg = msgParts.join(" ");
          if (!target || !msg) { err("Usage: ?dm <user> <message>"); break; }
          const sid = userSockets[target];
          if (!sid) { err(`${target} is not online`); break; }
          io.to(sid).emit("system-msg", { text: `[DM from ${username}] ${msg}` });
          ok(`DM sent to ${target}`);
          break;
        }

        case "create": {
          const id = args[0];
          if (!id) { err("Usage: ?create <room-id>"); break; }
          if (db.get(roomKey(id))) { err(`Room already exists: ${id}`); break; }
          saveRoom(db, { id, title: id, messages: [], members: [username], owner: username, isPrivate: false, createdAt: Date.now() });
          addLog(username, `create room ${id}`);
          ok(`Created #${id}`);
          break;
        }

        case "delroom": {
          const target = args[0];
          if (!target || target === "general") { err("Usage: ?delroom <room> (cannot delete general)"); break; }
          const rec: RoomRecord | undefined = db.get(roomKey(target));
          if (!rec) { err(`Room not found: ${target}`); break; }
          const index: string[] = db.get(ROOMS_INDEX) ?? [];
          db.set(ROOMS_INDEX, index.filter((r) => r !== target));
          if (db.del) db.del(roomKey(target)); else db.set(roomKey(target), null);
          addLog(username, `delroom ${target}`);
          ok(`Deleted #${target}`);
          break;
        }

        case "purge": {
          const n = Math.max(1, parseInt(args[0] ?? "10"));
          const rec: RoomRecord | undefined = db.get(roomKey(room));
          if (!rec) { err("Room not found"); break; }
          const removed = Math.min(n, rec.messages.length);
          rec.messages = rec.messages.slice(0, rec.messages.length - removed);
          saveRoom(db, rec);
          io.to(room).emit("clear-chat");
          addLog(username, `purge ${n} in ${room}`);
          ok(`Purged ${removed} messages from #${room}`);
          break;
        }

        case "announce": {
          const text = args.join(" ");
          if (!text) { err("Usage: ?announce <text>"); break; }
          sysAll(`[Announcement] ${text}`);
          addLog(username, `announce: ${text}`);
          ok("Announced to all channels");
          break;
        }

        case "broadcast": {
          const [target, ...msgParts] = args;
          const text = msgParts.join(" ");
          if (!target || !text) { err("Usage: ?broadcast <room> <text>"); break; }
          sysRoom(`[Broadcast] ${text}`, target);
          addLog(username, `broadcast to ${target}: ${text}`);
          ok(`Broadcast sent to #${target}`);
          break;
        }

        case "pinmsg": {
          const text = args.join(" ");
          if (!text) { err("Usage: ?pinmsg <text>"); break; }
          pinnedMessages.set(room, text);
          sysRoom(`[Pinned] ${text}`, room);
          addLog(username, `pin in ${room}: ${text}`);
          ok("Message pinned");
          break;
        }

        case "unpin": {
          const target = args[0] || room;
          pinnedMessages.delete(target);
          ok(`Unpinned in #${target}`);
          break;
        }

        case "stats": {
          const all = getAllRooms(db);
          const totalMessages = all.reduce((s, r) => s + r.messages.length, 0);
          ok(
            [
              `Rooms: ${all.length}`,
              `Total messages: ${totalMessages}`,
              `Online: ${Object.keys(userSockets).length}`,
              `Banned users: ${bannedUsers.size}`,
              `Banned IPs: ${bannedIPs.size}`,
              `Muted: ${mutedUsers.size}`,
              `Locked rooms: ${lockedRooms.size}`,
            ].join("\n"),
          );
          break;
        }

        case "uptime": {
          const s = Math.floor((Date.now() - serverStart) / 1000);
          const m = Math.floor(s / 60);
          const h = Math.floor(m / 60);
          const d = Math.floor(h / 24);
          ok(`Uptime: ${d}d ${h % 24}h ${m % 60}m ${s % 60}s`);
          break;
        }

        case "banlist": {
          const ub = Array.from(bannedUsers);
          const ib = Array.from(bannedIPs);
          ok(`Banned users (${ub.length}): ${ub.join(", ") || "none"}\nBanned IPs (${ib.length}): ${ib.join(", ") || "none"}`);
          break;
        }

        case "mutelist": {
          const muted = Array.from(mutedUsers);
          ok(`Muted (${muted.length}): ${muted.join(", ") || "none"}`);
          break;
        }

        case "adminlist": {
          const admins = Array.from(loadAdmins());
          ok(`Admins (${admins.length}): ${admins.join(", ")}`);
          break;
        }

        case "addadmin": {
          const target = args[0];
          if (!target) { err("Usage: ?addadmin <user>"); break; }
          runtimeAdmins.add(target);
          const sid = userSockets[target];
          if (sid) io.to(sid).emit("is-admin", true);
          addLog(username, `addadmin ${target}`);
          ok(`Granted admin to ${target} (runtime only — add to api/admins.json to persist)`);
          break;
        }

        case "removeadmin": {
          const target = args[0];
          if (!target) { err("Usage: ?removeadmin <user>"); break; }
          runtimeAdmins.delete(target);
          const sid = userSockets[target];
          if (sid) io.to(sid).emit("is-admin", false);
          addLog(username, `removeadmin ${target}`);
          ok(`Revoked admin from ${target}`);
          break;
        }

        case "logs": {
          const n = parseInt(args[0] ?? "20");
          const recent = modLogs.slice(-n);
          if (!recent.length) { ok("No logs"); break; }
          ok(`Last ${recent.length} actions:\n${recent.map((l) => `[${new Date(l.ts).toISOString()}] ${l.admin}: ${l.action}`).join("\n")}`);
          break;
        }

        case "clearlog": {
          modLogs.length = 0;
          ok("Mod log cleared");
          break;
        }

        case "echo": {
          const text = args.join(" ");
          if (!text) { err("Usage: ?echo <text>"); break; }
          sysRoom(`[System] ${text}`, room);
          ok("Echoed");
          break;
        }

        case "help": {
          ok(
            [
              "?ban <user>           — ban user (username + IP)",
              "?unban <user>         — unban username",
              "?banip <ip>           — ban IP directly",
              "?unbanip <ip>         — unban IP",
              "?getip <user>         — get user's IP",
              "?mute <user>          — mute user",
              "?unmute <user>        — unmute user",
              "?muteall              — mute all non-admins",
              "?unmuteall            — unmute everyone",
              "?kick <user>          — disconnect user",
              "?warn <user> <reason> — add warning",
              "?warnings <user>      — view warnings",
              "?clearwarns <user>    — clear warnings",
              "?timeout <user> <min> — temp mute",
              "?untimeout <user>     — remove timeout",
              "?view-channels        — list all channels",
              "?rooms                — alias for view-channels",
              "?roominfo [room]      — room details",
              "?lock [room]          — lock channel",
              "?unlock [room]        — unlock channel",
              "?lockall              — lock all channels",
              "?unlockall            — unlock all channels",
              "?slowmode <s> [room]  — set slowmode",
              "?clearroom [room]     — clear messages",
              "?rename <room> <name> — rename room",
              "?setprivate <room>    — make room private",
              "?setpublic <room>     — make room public",
              "?topic <room> <text>  — set room topic",
              "?resetroom <room>     — reset room",
              "?nuke <room>          — delete room entirely",
              "?members [room]       — list members",
              "?addmember <room> <u> — add user to room",
              "?removemember <r> <u> — remove user from room",
              "?transfer <room> <u>  — transfer ownership",
              "?setowner <room> <u>  — set room owner",
              "?create <name>        — create public room",
              "?delroom <room>       — delete any room",
              "?online               — list online users",
              "?count [room]         — connection count",
              "?whois <user>         — user info",
              "?dm <user> <msg>      — direct message",
              "?purge <n>            — delete last n messages",
              "?announce <text>      — broadcast to all rooms",
              "?broadcast <room> <t> — send to specific room",
              "?pinmsg <text>        — pin message in room",
              "?unpin [room]         — unpin",
              "?stats                — server statistics",
              "?uptime               — server uptime",
              "?banlist              — view bans",
              "?mutelist             — view muted users",
              "?adminlist            — view admins",
              "?addadmin <user>      — grant admin (runtime)",
              "?removeadmin <user>   — revoke admin",
              "?logs [n]             — view mod log",
              "?clearlog             — clear mod log",
              "?echo <text>          — system message in room",
              "?help                 — show this list",
            ].join("\n"),
          );
          break;
        }

        default:
          err(`Unknown command: ?${cmd}  —  type ?help for the full list`);
      }
    });

    socket.on("admin-get-panel", ({ username }: { username: string }) => {
      if (!checkAdmin(username)) return;
      const allRooms = getAllRooms(db);
      socket.emit("admin-panel-data", {
        onlineUsers: Object.keys(userSockets).map((u) => ({
          username: u,
          muted: mutedUsers.has(u),
          admin: checkAdmin(u),
          warns: warnings.get(u)?.length ?? 0,
        })),
        bannedUsers: Array.from(bannedUsers),
        bannedIPs: Array.from(bannedIPs),
        mutedUsers: Array.from(mutedUsers),
        rooms: allRooms.map((r) => ({
          id: r.id,
          title: r.title,
          members: r.members.length,
          messages: r.messages.length,
          isPrivate: r.isPrivate,
          locked: lockedRooms.has(r.id),
          slowmode: slowmodes.get(r.id) ?? 0,
          owner: r.owner,
        })),
        modLogs: modLogs.slice(-100),
        stats: {
          totalRooms: allRooms.length,
          totalMessages: allRooms.reduce((s, r) => s + r.messages.length, 0),
          online: Object.keys(userSockets).length,
          bannedUsers: bannedUsers.size,
          bannedIPs: bannedIPs.size,
          muted: mutedUsers.size,
          lockedRooms: lockedRooms.size,
          uptime: Math.floor((Date.now() - serverStart) / 1000),
        },
      });
    });

    socket.on("disconnect", () => {
      const meta = socketMeta[socket.id];
      if (meta) {
        io.to(meta.room).emit("room-count", Math.max(0, (io.sockets.adapter.rooms.get(meta.room)?.size ?? 1) - 1));
        delete socketMeta[socket.id];
      }
      if (user && userSockets[user] === socket.id) {
        delete userSockets[user];
      }
    });
  });
}
