// =====================================================================
// CampusConnect - C++ backend (HTTP + JSON API)
// Same data structures as the console version:
//   HashMap (separate chaining), MinHeap (priority waitlist),
//   Stack (undo), Graph + Dijkstra (campus navigation)
// The console menu is replaced by REST endpoints so a web frontend can use it.
//
// Build (Windows, MinGW g++):
//   g++ -std=c++17 -O2 server.cpp -o campusconnect.exe -lws2_32
// Build (Linux / Mac):
//   g++ -std=c++17 -O2 server.cpp -o campusconnect -pthread
// Run:
//   campusconnect.exe          -> API on http://localhost:8080/api/...
//   Frontend files in ./public are served at http://localhost:8080/
// =====================================================================
#include "httplib.h"
#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <ctime>
#include <cctype>
#include <cstdlib>
#include <sstream>
#include <array>
using namespace std;

// =====================================================================
// 1. HASH MAP  (separate chaining)   put/get/remove = O(1) avg
// =====================================================================
template <typename V>
class HashMap {
    struct Node { string key; V val; Node* next; };
    vector<Node*> table;
    int cap, cnt;
    int hashFn(const string& k) const {
        unsigned long h = 5381;
        for (char c : k) h = h * 33 + c;
        return (int)(h % cap);
    }
public:
    HashMap(int c = 31) : table(c, nullptr), cap(c), cnt(0) {}
    ~HashMap() {
        for (Node* n : table)
            while (n) { Node* t = n->next; delete n; n = t; }
    }
    HashMap(const HashMap&) = delete;
    HashMap& operator=(const HashMap&) = delete;

    void put(const string& k, const V& v) {
        int i = hashFn(k);
        for (Node* n = table[i]; n; n = n->next)
            if (n->key == k) { n->val = v; return; }
        table[i] = new Node{k, v, table[i]};
        cnt++;
    }
    V* get(const string& k) {
        for (Node* n = table[hashFn(k)]; n; n = n->next)
            if (n->key == k) return &n->val;
        return nullptr;
    }
    bool remove(const string& k) {
        int i = hashFn(k);
        Node* prev = nullptr;
        for (Node* n = table[i]; n; prev = n, n = n->next)
            if (n->key == k) {
                if (prev) prev->next = n->next; else table[i] = n->next;
                delete n; cnt--;
                return true;
            }
        return false;
    }
    vector<V*> all() {
        vector<V*> out;
        for (Node* n : table)
            for (; n; n = n->next) out.push_back(&n->val);
        return out;
    }
    vector<string> keys() {
        vector<string> out;
        for (Node* n : table)
            for (; n; n = n->next) out.push_back(n->key);
        return out;
    }
    void clear() {
        for (Node*& n : table) {
            while (n) { Node* t = n->next; delete n; n = t; }
            n = nullptr;
        }
        cnt = 0;
    }
    int size() const { return cnt; }
};

// =====================================================================
// 2. MIN-HEAP (priority queue)   insert/extractMin = O(log n)
// =====================================================================
template <typename T>
class MinHeap {
public:
    struct Item { long long score; T data; };
private:
    vector<Item> a;
    void up(int i) {
        while (i > 0) {
            int p = (i - 1) / 2;
            if (a[p].score <= a[i].score) break;
            swap(a[p], a[i]);
            i = p;
        }
    }
    void down(int i) {
        int n = (int)a.size();
        while (true) {
            int l = 2 * i + 1, r = 2 * i + 2, m = i;
            if (l < n && a[l].score < a[m].score) m = l;
            if (r < n && a[r].score < a[m].score) m = r;
            if (m == i) break;
            swap(a[m], a[i]);
            i = m;
        }
    }
public:
    bool empty() const { return a.empty(); }
    int size() const { return (int)a.size(); }
    void insert(long long score, const T& data) {
        a.push_back(Item{score, data});
        up((int)a.size() - 1);
    }
    Item extractMin() {
        Item top = a[0];
        a[0] = a.back();
        a.pop_back();
        if (!a.empty()) down(0);
        return top;
    }
    vector<Item> sorted() const {
        MinHeap copy = *this;
        vector<Item> out;
        while (!copy.empty()) out.push_back(copy.extractMin());
        return out;
    }
};

// =====================================================================
// 3. STACK (linked list)   push/pop = O(1)
// =====================================================================
template <typename T>
class Stack {
    struct Node { T val; Node* next; };
    Node* topNode = nullptr;
    int cnt = 0;
public:
    ~Stack() { while (topNode) { Node* t = topNode->next; delete topNode; topNode = t; } }
    void push(const T& v) { topNode = new Node{v, topNode}; cnt++; }
    bool pop(T& out) {
        if (!topNode) return false;
        out = topNode->val;
        Node* t = topNode;
        topNode = topNode->next;
        delete t; cnt--;
        return true;
    }
    const T* peek() const { return topNode ? &topNode->val : nullptr; }
    vector<T> toVector() const {                       // top -> bottom, used for saving
        vector<T> out;
        for (Node* n = topNode; n; n = n->next) out.push_back(n->val);
        return out;
    }
    bool empty() const { return topNode == nullptr; }
    void clear() {
        while (topNode) { Node* t = topNode->next; delete topNode; topNode = t; }
        cnt = 0;
    }
    int size() const { return cnt; }
};

// =====================================================================
// 4. GRAPH (adjacency list) + DIJKSTRA   O((V+E) log V)
// =====================================================================
class Graph {
    vector<string> names;
    vector<vector<pair<int, int>>> adj;
    HashMap<int> index;
public:
    int addNode(const string& n) {
        int* p = index.get(n);
        if (p) return *p;
        names.push_back(n);
        adj.push_back({});
        index.put(n, (int)names.size() - 1);
        return (int)names.size() - 1;
    }
    void addEdge(const string& a, const string& b, int w) {
        int u = addNode(a), v = addNode(b);
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }
    int find(const string& n) { int* p = index.get(n); return p ? *p : -1; }
    void clear() {
        names.clear();
        adj.clear();
        index.clear();
    }
    const vector<string>& nodes() const { return names; }
    const vector<vector<pair<int, int>>>& edges() const { return adj; }

    int shortestPath(int s, int t, vector<int>& path) {
        const int INF = 1000000000;
        vector<int> dist(names.size(), INF), prev(names.size(), -1);
        MinHeap<int> pq;
        dist[s] = 0;
        pq.insert(0, s);
        while (!pq.empty()) {
            auto it = pq.extractMin();
            int u = it.data;
            if (it.score > dist[u]) continue;
            if (u == t) break;
            for (auto& e : adj[u]) {
                int nd = dist[u] + e.second;
                if (nd < dist[e.first]) {
                    dist[e.first] = nd;
                    prev[e.first] = u;
                    pq.insert(nd, e.first);
                }
            }
        }
        if (dist[t] == INF) return -1;
        path.clear();
        for (int x = t; x != -1; x = prev[x]) path.insert(path.begin(), x);
        return dist[t];
    }
};

// =====================================================================
// APP DATA
// =====================================================================
struct Resource { string id, name, category, location; int capacity; };
struct Booking  { string resId, date, slot, user, role; };
struct Action {
    char type;                      // 'B' = booked, 'C' = cancelled
    string key;
    Booking b;
    bool promoted = false;
    MinHeap<Booking>::Item pe{};
};
struct LogEntry { string time, text, kind; };

HashMap<Resource>          resources;
HashMap<Booking>           bookings;
HashMap<MinHeap<Booking>>  waitlists;
Stack<Action>              undoStack;
Graph                      campus;
long long                  seqNo = 0;
vector<LogEntry>           activity;     // recent actions for the dashboard
mutex                      mtx;          // server is multi-threaded, guard all data

const vector<string> SLOTS = {"8AM","9AM","10AM","11AM","12PM","1PM","2PM","3PM","4PM","5PM"};
const vector<string> CATEGORIES = {"Hall","Lab","Sports","Library"};
const vector<string> ROLES = {"Faculty","Club","Student"};

// =====================================================================
// HELPERS
// =====================================================================
string toUpper(string s) { for (auto& c : s) c = (char)toupper((unsigned char)c); return s; }
string toLower(string s) { for (auto& c : s) c = (char)tolower((unsigned char)c); return s; }
string trim(const string& s) {
    size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
    return a == string::npos ? "" : s.substr(a, b - a + 1);
}
string slotKey(const string& id, const string& date, const string& slot) {
    return id + "|" + date + "|" + slot;
}
int roleWeight(const string& r) { return r == "Faculty" ? 0 : (r == "Club" ? 1 : 2); }
bool validRole(const string& r) { return r == "Faculty" || r == "Club" || r == "Student"; }
string normRole(string r) {
    r = toLower(trim(r));
    if (r == "faculty") return "Faculty";
    if (r == "club") return "Club";
    if (r == "student") return "Student";
    return "";
}
bool validDate(const string& d) {           // YYYY-MM-DD
    if (d.size() != 10 || d[4] != '-' || d[7] != '-') return false;
    for (int i : {0,1,2,3,5,6,8,9}) if (!isdigit((unsigned char)d[i])) return false;
    return true;
}
string nowTime() {
    time_t t = time(nullptr);
    char buf[32];
    strftime(buf, sizeof buf, "%Y-%m-%d %H:%M:%S", localtime(&t));
    return buf;
}
void saveAll();                              // file database, defined below
bool loading = false;                        // true while reading files at startup

// every change in the app calls logAct, so this is also where we save to disk
void logAct(const string& kind, const string& text) {
    activity.push_back({nowTime(), text, kind});
    if (activity.size() > 50) activity.erase(activity.begin());
    if (!loading) saveAll();
}

// ---------- tiny JSON writer ----------
string esc(const string& s) {
    string o = "\"";
    for (char c : s) {
        switch (c) {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n";  break;
            case '\r': o += "\\r";  break;
            case '\t': o += "\\t";  break;
            default:
                if ((unsigned char)c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; }
                else o += c;
        }
    }
    return o + "\"";
}
string jRes(const Resource& r) {
    return "{\"id\":" + esc(r.id) + ",\"name\":" + esc(r.name) + ",\"category\":" + esc(r.category) +
           ",\"location\":" + esc(r.location) + ",\"capacity\":" + to_string(r.capacity) + "}";
}
string jBook(const Booking& b) {
    Resource* r = resources.get(b.resId);
    return "{\"resId\":" + esc(b.resId) + ",\"resourceName\":" + esc(r ? r->name : "") +
           ",\"location\":" + esc(r ? r->location : "") +
           ",\"date\":" + esc(b.date) + ",\"slot\":" + esc(b.slot) +
           ",\"user\":" + esc(b.user) + ",\"role\":" + esc(b.role) + "}";
}
string jStrArr(const vector<string>& v) {
    string o = "[";
    for (size_t i = 0; i < v.size(); i++) o += (i ? "," : "") + esc(v[i]);
    return o + "]";
}

// ---------- tiny JSON reader (flat object, string/number/bool values) ----------
map<string, string> parseJson(const string& s) {
    map<string, string> m;
    size_t i = 0, n = s.size();
    auto ws = [&]() { while (i < n && isspace((unsigned char)s[i])) i++; };
    auto readStr = [&](string& out) -> bool {
        if (i >= n || s[i] != '"') return false;
        i++;
        while (i < n && s[i] != '"') {
            if (s[i] == '\\' && i + 1 < n) {
                char e = s[++i];
                if (e == 'n') out += '\n'; else if (e == 't') out += '\t';
                else if (e == 'u' && i + 4 < n) { out += '?'; i += 4; }
                else out += e;
            } else out += s[i];
            i++;
        }
        i++;
        return true;
    };
    ws();
    if (i >= n || s[i] != '{') return m;
    i++;
    while (i < n) {
        ws();
        if (i < n && s[i] == '}') break;
        string k, v;
        if (!readStr(k)) break;
        ws();
        if (i >= n || s[i] != ':') break;
        i++; ws();
        if (i < n && s[i] == '"') readStr(v);
        else { while (i < n && s[i] != ',' && s[i] != '}') v += s[i++]; v = trim(v); }
        m[k] = v;
        ws();
        if (i < n && s[i] == ',') i++;
    }
    return m;
}

// ---------- response helpers ----------
void sendJson(httplib::Response& res, int code, const string& body) {
    res.status = code;
    res.set_content(body, "application/json");
}
void ok(httplib::Response& res, const string& msg, const string& extra = "") {
    sendJson(res, 200, "{\"ok\":true,\"message\":" + esc(msg) + (extra.empty() ? "" : "," + extra) + "}");
}
void fail(httplib::Response& res, int code, const string& msg) {
    sendJson(res, code, "{\"ok\":false,\"error\":" + esc(msg) + "}");
}
string param(const httplib::Request& req, const string& k) {
    return req.has_param(k) ? trim(req.get_param_value(k)) : "";
}
bool toInt(const string& s, int& out) {
    try { size_t p; out = stoi(s, &p); return p == s.size(); } catch (...) { return false; }
}

// =====================================================================
// CORE LOGIC (same rules as console version)
// =====================================================================
bool lessThan(const Resource& a, const Resource& b, const string& mode) {
    if (mode == "name") return toLower(a.name) < toLower(b.name);
    if (mode == "capacity") return a.capacity < b.capacity;
    return a.id < b.id;
}
vector<Resource> sortedResources(const string& mode) {        // insertion sort O(n^2)
    vector<Resource> v;
    for (Resource* r : resources.all()) v.push_back(*r);
    for (size_t i = 1; i < v.size(); i++) {
        Resource key = v[i];
        int j = (int)i - 1;
        while (j >= 0 && lessThan(key, v[j], mode)) { v[j + 1] = v[j]; j--; }
        v[j + 1] = key;
    }
    return v;
}
int waitCount(const string& k) {
    MinHeap<Booking>* h = waitlists.get(k);
    return h ? h->size() : 0;
}
string nextId() {
    int mx = 0;
    for (Resource* r : resources.all()) {
        int v;
        if (r->id.size() > 1 && r->id[0] == 'R' && toInt(r->id.substr(1), v) && v > mx) mx = v;
    }
    char b[16]; snprintf(b, sizeof b, "R%03d", mx + 1);
    return b;
}

// =====================================================================
// FILE DATABASE (file handling)
// All data lives in the data/ folder as plain text files, one record per
// line, fields separated by TAB. Files are rewritten after every change
// (write to .tmp first, then replace, so a crash never leaves half a file).
//
//   data/resources.txt   id  name  category  location  capacity
//   data/bookings.txt    resId  date  slot  user  role
//   data/waitlist.txt    score  resId  date  slot  user  role
//   data/campus.txt      venueA  venueB  distance
//   data/undo.txt        type  key  resId date slot user role  promoted  score resId date slot user role
//   data/meta.txt        seqNo
//   data/activity.txt    time  kind  text
// =====================================================================
#ifdef _WIN32
#include <direct.h>
#define MAKE_DIR(p) _mkdir(p)
#else
#include <sys/stat.h>
#define MAKE_DIR(p) mkdir(p, 0755)
#endif
#include <fstream>
#include <cstdio>

const string DATA_DIR = "data";
vector<array<string, 3>> campusEdges;        // kept so the map can be saved too
vector<string> campusNodes;                  // all known venues

struct NodePos { int x = 0; int y = 0; };
map<string, NodePos> campusPositions;

void setDefaultPositionsIfMissing() {
    map<string, pair<int, int>> defaults = {
        {"MainGate", {90, 360}},
        {"Block A", {210, 190}},
        {"library", {290, 90}},
        {"Library", {290, 90}},
        {"block C", {360, 200}},
        {"Block D", {510, 180}},
        {"block E(Nursing Block)", {600, 290}},
        {"canteen", {220, 370}},
        {"mess/DS", {330, 410}},
        {"OAT", {400, 310}},
        {"nescafe", {450, 400}},
        {"Block1", {260, 220}},
        {"Block2", {440, 220}},
        {"SportsComplex", {580, 360}}
    };
    for (const string& n : campusNodes) {
        if (campusPositions.find(n) == campusPositions.end()) {
            if (defaults.count(n)) {
                campusPositions[n] = {defaults[n].first, defaults[n].second};
            } else {
                campusPositions[n] = {360, 240};
            }
        }
    }
}

string clean(string s) {                     // TAB / newline would break the format
    for (auto& c : s) if (c == '\t' || c == '\n' || c == '\r') c = ' ';
    return s;
}
vector<string> splitTab(const string& line) {
    vector<string> out;
    string cur;
    for (char c : line) {
        if (c == '\t') { out.push_back(cur); cur.clear(); }
        else if (c != '\r') cur += c;
    }
    out.push_back(cur);
    return out;
}
string bookingLine(const Booking& b) {
    return clean(b.resId) + "\t" + clean(b.date) + "\t" + clean(b.slot) + "\t" + clean(b.user) + "\t" + clean(b.role);
}
Booking bookingFrom(const vector<string>& f, size_t i) {
    return Booking{f[i], f[i + 1], f[i + 2], f[i + 3], f[i + 4]};
}

bool writeFile(const string& name, const vector<string>& lines) {
    string path = DATA_DIR + "/" + name, tmp = path + ".tmp";
    {
        ofstream out(tmp, ios::trunc);
        if (!out) return false;
        for (auto& l : lines) out << l << "\n";
    }
    remove(path.c_str());                    // Windows rename fails if target exists
    return rename(tmp.c_str(), path.c_str()) == 0;
}
bool readFile(const string& name, vector<vector<string>>& rows) {
    ifstream in(DATA_DIR + "/" + name);
    if (!in) return false;
    string line;
    while (getline(in, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (line.empty()) continue;
        rows.push_back(splitTab(line));
    }
    return true;
}

void saveAll() {
    MAKE_DIR(DATA_DIR.c_str());
    vector<string> L;

    for (Resource* r : resources.all())
        L.push_back(clean(r->id) + "\t" + clean(r->name) + "\t" + clean(r->category) + "\t" +
                    clean(r->location) + "\t" + to_string(r->capacity));
    writeFile("resources.txt", L); L.clear();

    for (Booking* b : bookings.all()) L.push_back(bookingLine(*b));
    writeFile("bookings.txt", L); L.clear();

    vector<string> keys = waitlists.keys();
    for (auto& k : keys)
        for (auto& it : waitlists.get(k)->sorted())
            L.push_back(to_string(it.score) + "\t" + bookingLine(it.data));
    writeFile("waitlist.txt", L); L.clear();

    for (auto& e : campusEdges) L.push_back(clean(e[0]) + "\t" + clean(e[1]) + "\t" + e[2]);
    for (const string& n : campusNodes) {
        bool hasEdge = false;
        for (auto& e : campusEdges) {
            if (e[0] == n || e[1] == n) { hasEdge = true; break; }
        }
        if (!hasEdge) L.push_back(clean(n));
    }
    writeFile("campus.txt", L); L.clear();

    for (auto& kv : campusPositions) {
        L.push_back(clean(kv.first) + "\t" + to_string(kv.second.x) + "\t" + to_string(kv.second.y));
    }
    writeFile("positions.txt", L); L.clear();

    vector<Action> acts = undoStack.toVector();            // top -> bottom
    for (int i = (int)acts.size() - 1; i >= 0; i--) {      // save bottom first
        const Action& a = acts[i];
        L.push_back(string(1, a.type) + "\t" + clean(a.key) + "\t" + bookingLine(a.b) + "\t" +
                    (a.promoted ? "1" : "0") + "\t" + to_string(a.pe.score) + "\t" + bookingLine(a.pe.data));
    }
    writeFile("undo.txt", L); L.clear();

    L.push_back(to_string(seqNo));
    writeFile("meta.txt", L); L.clear();

    for (auto& a : activity) L.push_back(clean(a.time) + "\t" + clean(a.kind) + "\t" + clean(a.text));
    writeFile("activity.txt", L);
}

void addCampusEdge(const string& a, const string& b, int w) {
    if (find(campusNodes.begin(), campusNodes.end(), a) == campusNodes.end()) campusNodes.push_back(a);
    if (find(campusNodes.begin(), campusNodes.end(), b) == campusNodes.end()) campusNodes.push_back(b);
    campus.addEdge(a, b, w);
    campusEdges.push_back({a, b, to_string(w)});
}

void rebuildCampus() {
    campus.clear();
    for (const string& n : campusNodes) campus.addNode(n);
    for (auto& e : campusEdges) {
        int w = 0;
        toInt(e[2], w);
        campus.addEdge(e[0], e[1], w);
    }
}

// returns false if there is no saved data yet (first run)
bool loadAll() {
    vector<vector<string>> rows;
    if (!readFile("resources.txt", rows)) return false;
    loading = true;

    for (auto& f : rows) {
        int cap;
        if (f.size() < 5 || !toInt(f[4], cap)) continue;
        resources.put(f[0], Resource{f[0], f[1], f[2], f[3], cap});
    }

    rows.clear();
    campusNodes.clear();
    campusEdges.clear();
    campus.clear();
    if (readFile("campus.txt", rows))
        for (auto& f : rows) {
            int w;
            if (f.size() >= 3 && toInt(f[2], w)) {
                addCampusEdge(f[0], f[1], w);
            } else if (f.size() >= 1 && !f[0].empty()) {
                if (find(campusNodes.begin(), campusNodes.end(), f[0]) == campusNodes.end()) {
                    campusNodes.push_back(f[0]);
                }
                campus.addNode(f[0]);
            }
        }

    campusPositions.clear();
    rows.clear();
    if (readFile("positions.txt", rows)) {
        for (auto& f : rows) {
            int px = 0, py = 0;
            if (f.size() >= 3 && toInt(f[1], px) && toInt(f[2], py)) {
                campusPositions[f[0]] = {px, py};
            }
        }
    }
    setDefaultPositionsIfMissing();

    rows.clear();
    readFile("bookings.txt", rows);
    for (auto& f : rows) {
        if (f.size() < 5) continue;
        Booking b = bookingFrom(f, 0);
        bookings.put(slotKey(b.resId, b.date, b.slot), b);
    }

    rows.clear();
    readFile("waitlist.txt", rows);
    for (auto& f : rows) {
        if (f.size() < 6) continue;
        long long score;
        try { score = stoll(f[0]); } catch (...) { continue; }
        Booking b = bookingFrom(f, 1);
        string k = slotKey(b.resId, b.date, b.slot);
        if (!waitlists.get(k)) waitlists.put(k, MinHeap<Booking>());
        waitlists.get(k)->insert(score, b);
    }

    rows.clear();
    readFile("undo.txt", rows);                            // bottom first, so push in order
    for (auto& f : rows) {
        if (f.size() < 14 || f[0].empty()) continue;
        Action a;
        a.type = f[0][0];
        a.key = f[1];
        a.b = bookingFrom(f, 2);
        a.promoted = f[7] == "1";
        try { a.pe.score = stoll(f[8]); } catch (...) { a.pe.score = 0; }
        a.pe.data = bookingFrom(f, 9);
        undoStack.push(a);
    }

    rows.clear();
    if (readFile("meta.txt", rows) && !rows.empty())
        try { seqNo = stoll(rows[0][0]); } catch (...) {}

    rows.clear();
    readFile("activity.txt", rows);
    for (auto& f : rows)
        if (f.size() >= 3) activity.push_back({f[0], f[2], f[1]});

    logAct("system", "Server started, data loaded from files (" + to_string(resources.size()) +
                     " resources, " + to_string(bookings.size()) + " bookings)");
    loading = false;
    saveAll();
    return true;
}

void loadSampleCampus() {
    campusNodes.clear();
    campusEdges.clear();
    campus.clear();
    campusPositions.clear();
    campusNodes = {"MainGate", "Block1", "Block2", "Library", "SportsComplex"};
    addCampusEdge("MainGate", "Block1", 120);
    addCampusEdge("Block1", "Block2", 80);
    addCampusEdge("Block2", "SportsComplex", 200);
    addCampusEdge("MainGate", "Library", 150);
    addCampusEdge("Library", "Block2", 100);
    setDefaultPositionsIfMissing();
}

void loadSampleData() {
    loadSampleCampus();

    resources.put("R001", Resource{"R001", "Seminar Hall A", "Hall", "Block2", 150});
    resources.put("R002", Resource{"R002", "Basketball Court", "Sports", "SportsComplex", 20});
    resources.put("R003", Resource{"R003", "Computer Lab 3", "Lab", "Block1", 60});
    resources.put("R004", Resource{"R004", "Library Discussion Room", "Library", "Library", 10});
    logAct("system", "First run: sample data loaded and saved to data/ folder");
}

// =====================================================================
// MAIN / ROUTES
// =====================================================================
int main(int argc, char** argv) {
    int port = 8080;
    const char* envPort = std::getenv("PORT");
    if (envPort) toInt(envPort, port);
    if (argc > 1) toInt(argv[1], port);
    if (!loadAll()) loadSampleData();          // file database, sample data only on first run
    if (campus.nodes().empty()) { loadSampleCampus(); saveAll(); }

    httplib::Server svr;

    // CORS so a frontend dev server (Vite on :5173 etc.) can call the API
    svr.set_default_headers({
        {"Access-Control-Allow-Origin", "*"},
        {"Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"},
        {"Access-Control-Allow-Headers", "*"}
    });
    svr.Options(R"(/.*)", [](const httplib::Request&, httplib::Response& res) { res.status = 204; });

    // ---------------- META ----------------
    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        ok(res, "CampusConnect C++ backend running");
    });

    svr.Get("/api/meta", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        sendJson(res, 200, "{\"slots\":" + jStrArr(SLOTS) + ",\"categories\":" + jStrArr(CATEGORIES) +
                           ",\"roles\":" + jStrArr(ROLES) + ",\"venues\":" + jStrArr(campus.nodes()) +
                           ",\"nextId\":" + esc(nextId()) + "}");
    });

    svr.Get("/api/stats", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        int waiting = 0;
        for (MinHeap<Booking>* h : waitlists.all()) waiting += h->size();
        map<string, int> byCat, byRole;
        for (Resource* r : resources.all()) byCat[r->category]++;
        for (Booking* b : bookings.all()) byRole[b->role]++;
        string cat = "{", role = "{";
        for (auto& p : byCat)  cat  += (cat.size() > 1 ? "," : "") + esc(p.first) + ":" + to_string(p.second);
        for (auto& p : byRole) role += (role.size() > 1 ? "," : "") + esc(p.first) + ":" + to_string(p.second);
        sendJson(res, 200,
            "{\"resources\":" + to_string(resources.size()) +
            ",\"bookings\":" + to_string(bookings.size()) +
            ",\"waitlisted\":" + to_string(waiting) +
            ",\"venues\":" + to_string(campus.nodes().size()) +
            ",\"undoAvailable\":" + to_string(undoStack.size()) +
            ",\"resourcesByCategory\":" + cat + "}" +
            ",\"bookingsByRole\":" + role + "}}");
    });

    svr.Get("/api/activity", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        string o = "[";
        for (int i = (int)activity.size() - 1, c = 0; i >= 0; i--, c++)
            o += (c ? "," : "") + string("{\"time\":") + esc(activity[i].time) +
                 ",\"kind\":" + esc(activity[i].kind) + ",\"text\":" + esc(activity[i].text) + "}";
        sendJson(res, 200, o + "]");
    });

    // ---------------- RESOURCES (Hash Map) ----------------
    // GET /api/resources?sort=id|name|capacity&q=keyword&category=Lab
    svr.Get("/api/resources", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        string sort = toLower(param(req, "sort")), q = toLower(param(req, "q")), cat = toLower(param(req, "category"));
        vector<Resource> v = sortedResources(sort.empty() ? "id" : sort);
        string o = "[";
        bool first = true;
        for (auto& r : v) {
            if (!q.empty() && toLower(r.name).find(q) == string::npos && toLower(r.id).find(q) == string::npos) continue;
            if (!cat.empty() && toLower(r.category) != cat) continue;
            o += (first ? "" : ",") + jRes(r);
            first = false;
        }
        sendJson(res, 200, o + "]");
    });

    // GET /api/resources/R001  (hash lookup O(1))
    svr.Get(R"(/api/resources/([^/]+))", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        Resource* r = resources.get(toUpper(req.matches[1]));
        if (!r) return fail(res, 404, "Resource not found");
        sendJson(res, 200, jRes(*r));
    });

    // POST /api/resources  {id?, name, category, location, capacity}
    svr.Post("/api/resources", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        auto m = parseJson(req.body);
        Resource r;
        r.id = toUpper(trim(m["id"]));
        if (r.id.empty()) r.id = nextId();
        r.name = trim(m["name"]);
        r.category = trim(m["category"]);
        r.location = trim(m["location"]);
        if (resources.get(r.id)) return fail(res, 409, "ID already exists");
        if (r.name.empty()) return fail(res, 400, "Name is required");
        if (r.category.empty()) return fail(res, 400, "Category is required");
        if (campus.find(r.location) < 0) return fail(res, 400, "Venue must be one of the campus venues");
        if (!toInt(trim(m["capacity"]), r.capacity) || r.capacity <= 0) return fail(res, 400, "Capacity must be a positive number");
        resources.put(r.id, r);
        logAct("resource", "Added resource " + r.id + " (" + r.name + ")");
        ok(res, "Added", "\"resource\":" + jRes(r));
    });

    // PUT /api/resources/R001  {name?, category?, location?, capacity?}  (empty = keep)
    svr.Put(R"(/api/resources/([^/]+))", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        Resource* r = resources.get(toUpper(req.matches[1]));
        if (!r) return fail(res, 404, "Resource not found");
        auto m = parseJson(req.body);
        if (!trim(m["name"]).empty()) r->name = trim(m["name"]);
        if (!trim(m["category"]).empty()) r->category = trim(m["category"]);
        if (!trim(m["location"]).empty()) {
            if (campus.find(trim(m["location"])) < 0) return fail(res, 400, "Unknown venue");
            r->location = trim(m["location"]);
        }
        if (!trim(m["capacity"]).empty()) {
            int c;
            if (!toInt(trim(m["capacity"]), c) || c <= 0) return fail(res, 400, "Capacity must be a positive number");
            r->capacity = c;
        }
        logAct("resource", "Updated resource " + r->id);
        ok(res, "Updated", "\"resource\":" + jRes(*r));
    });

    // DELETE /api/resources/R001  (blocked if it has active bookings)
    svr.Delete(R"(/api/resources/([^/]+))", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        string id = toUpper(req.matches[1]);
        if (!resources.get(id)) return fail(res, 404, "Resource not found");
        for (Booking* b : bookings.all())
            if (b->resId == id) return fail(res, 409, "Cannot delete: it has active bookings");
        resources.remove(id);
        logAct("resource", "Deleted resource " + id);
        ok(res, "Deleted");
    });

    // ---------------- BOOKINGS (Hash Map + Min-Heap + Stack) ----------------
    // GET /api/bookings?resId=R001&date=2026-11-02&user=name&role=Faculty
    svr.Get("/api/bookings", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        string rid = toUpper(param(req, "resId")), date = param(req, "date"),
               user = toLower(param(req, "user")), role = normRole(param(req, "role"));
        string o = "[";
        bool first = true;
        for (Booking* b : bookings.all()) {
            if (!rid.empty() && b->resId != rid) continue;
            if (!date.empty() && b->date != date) continue;
            if (!user.empty() && toLower(b->user).find(user) == string::npos) continue;
            if (!role.empty() && b->role != role) continue;
            string k = slotKey(b->resId, b->date, b->slot);
            string item = jBook(*b);
            item.pop_back();
            item += ",\"waitlistCount\":" + to_string(waitCount(k)) + "}";
            o += (first ? "" : ",") + item;
            first = false;
        }
        sendJson(res, 200, o + "]");
    });

    // GET /api/slots?resId=R001&date=2026-11-02 -> availability grid for a day
    svr.Get("/api/slots", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        string rid = toUpper(param(req, "resId")), date = param(req, "date");
        if (!resources.get(rid)) return fail(res, 404, "Resource not found");
        if (!validDate(date)) return fail(res, 400, "Date must be YYYY-MM-DD");
        string o = "[";
        for (size_t i = 0; i < SLOTS.size(); i++) {
            string k = slotKey(rid, date, SLOTS[i]);
            Booking* b = bookings.get(k);
            o += (i ? "," : "") + string("{\"slot\":") + esc(SLOTS[i]) +
                 ",\"status\":" + esc(b ? "booked" : "free") +
                 ",\"holder\":" + (b ? jBook(*b) : "null") +
                 ",\"waitlistCount\":" + to_string(waitCount(k)) + "}";
        }
        sendJson(res, 200, o + "]");
    });

    // POST /api/bookings  {resId, date, slot, user, role}
    svr.Post("/api/bookings", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        auto m = parseJson(req.body);
        string id = toUpper(trim(m["resId"])), date = trim(m["date"]), slot = toUpper(trim(m["slot"]));
        string user = trim(m["user"]), role = normRole(m["role"]);
        Resource* r = resources.get(id);
        if (!r) return fail(res, 404, "No such resource");
        if (!validDate(date)) return fail(res, 400, "Date must be YYYY-MM-DD");
        if (slot.empty()) return fail(res, 400, "Time slot is required");
        if (user.empty()) return fail(res, 400, "Name is required");
        if (role.empty()) return fail(res, 400, "Role must be Faculty, Club or Student");

        Booking b{id, date, slot, user, role};
        string k = slotKey(id, date, slot);
        Booking* cur = bookings.get(k);
        if (!cur) {
            bookings.put(k, b);
            Action a; a.type = 'B'; a.key = k; a.b = b;
            undoStack.push(a);
            logAct("booking", user + " (" + role + ") booked " + r->name + " on " + date + " " + slot);
            return ok(res, "CONFIRMED: " + r->name + " at " + r->location + ", " + date + " " + slot,
                      "\"status\":\"confirmed\",\"booking\":" + jBook(b));
        }
        if (toLower(cur->user) == toLower(user)) return fail(res, 409, "You already hold this slot");

        MinHeap<Booking>* h = waitlists.get(k);
        if (h)
            for (auto& it : h->sorted())
                if (toLower(it.data.user) == toLower(user)) return fail(res, 409, "You are already on the waitlist for this slot");
        if (!h) { waitlists.put(k, MinHeap<Booking>()); h = waitlists.get(k); }
        long long score = roleWeight(role) * 1000000000LL + seqNo++;
        h->insert(score, b);
        int pos = 0;
        for (auto& it : h->sorted()) { pos++; if (it.score == score) break; }
        logAct("waitlist", user + " (" + role + ") waitlisted #" + to_string(pos) + " for " + r->name + " " + date + " " + slot);
        ok(res, "Slot is full. WAITLISTED at position #" + to_string(pos),
           "\"status\":\"waitlisted\",\"position\":" + to_string(pos) + ",\"heldBy\":" + jBook(*cur));
    });

    // POST /api/bookings/cancel  {resId, date, slot}
    svr.Post("/api/bookings/cancel", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        auto m = parseJson(req.body);
        string id = toUpper(trim(m["resId"])), date = trim(m["date"]), slot = toUpper(trim(m["slot"]));
        if (!resources.get(id)) return fail(res, 404, "No such resource");
        string k = slotKey(id, date, slot);
        Booking* cur = bookings.get(k);
        if (!cur) return fail(res, 404, "No booking for that slot");

        Action a; a.type = 'C'; a.key = k; a.b = *cur;
        bookings.remove(k);
        string msg = "Cancelled booking of " + a.b.user + ".";
        string extra = "\"promoted\":null";
        MinHeap<Booking>* h = waitlists.get(k);
        if (h && !h->empty()) {
            a.pe = h->extractMin();
            a.promoted = true;
            bookings.put(k, a.pe.data);
            msg += " " + a.pe.data.user + " (" + a.pe.data.role + ") promoted to CONFIRMED.";
            extra = "\"promoted\":" + jBook(a.pe.data);
        }
        undoStack.push(a);
        logAct("cancel", msg);
        ok(res, msg, extra);
    });

    // POST /api/undo   (pops the Stack)
    svr.Post("/api/undo", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        Action a;
        if (!undoStack.pop(a)) return fail(res, 400, "Nothing to undo");
        string msg;
        if (a.type == 'B') {
            bookings.remove(a.key);
            msg = "Undone: booking by " + a.b.user + " removed.";
            MinHeap<Booking>* h = waitlists.get(a.key);
            if (h && !h->empty()) {
                auto next = h->extractMin();
                bookings.put(a.key, next.data);
                msg += " Waitlist: " + next.data.user + " (" + next.data.role + ") now holds this slot.";
            }
        } else {
            bookings.put(a.key, a.b);
            if (a.promoted) waitlists.get(a.key)->insert(a.pe.score, a.pe.data);
            msg = "Undone: booking by " + a.b.user + " restored.";
        }
        logAct("undo", msg);
        ok(res, msg, "\"undoLeft\":" + to_string(undoStack.size()));
    });

    // GET /api/undo/peek -> what the next undo will do
    svr.Get("/api/undo/peek", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        const Action* a = undoStack.peek();
        if (!a) return sendJson(res, 200, "{\"available\":false,\"count\":0}");
        sendJson(res, 200, "{\"available\":true,\"count\":" + to_string(undoStack.size()) +
                           ",\"type\":" + esc(a->type == 'B' ? "booking" : "cancel") +
                           ",\"booking\":" + jBook(a->b) + "}");
    });

    // GET /api/waitlist?resId=R001&date=2026-11-02&slot=10AM
    svr.Get("/api/waitlist", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        string id = toUpper(param(req, "resId")), date = param(req, "date"), slot = toUpper(param(req, "slot"));
        if (!resources.get(id)) return fail(res, 404, "No such resource");
        string k = slotKey(id, date, slot);
        Booking* cur = bookings.get(k);
        MinHeap<Booking>* h = waitlists.get(k);
        string o = "{\"heldBy\":" + (cur ? jBook(*cur) : string("null")) + ",\"queue\":[";
        if (h) {
            int pos = 0;
            for (auto& it : h->sorted()) {
                string sep = pos ? "," : "";
                pos++;
                o += sep + "{\"position\":" + to_string(pos) +
                     ",\"user\":" + esc(it.data.user) + ",\"role\":" + esc(it.data.role) + "}";
            }
        }
        sendJson(res, 200, o + "]}");
    });

    // ---------------- NAVIGATION (Graph + Dijkstra) ----------------
    svr.Get("/api/venues", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        sendJson(res, 200, jStrArr(campus.nodes()));
    });

    // GET /api/graph -> nodes + edges, for drawing the campus map
    svr.Get("/api/graph", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        const auto& n = campus.nodes();
        const auto& adj = campus.edges();
        string e = "[";
        bool first = true;
        for (size_t u = 0; u < adj.size(); u++)
            for (auto& p : adj[u])
                if ((int)u < p.first) {
                    e += (first ? "" : ",") + string("{\"from\":") + esc(n[u]) + ",\"to\":" + esc(n[p.first]) +
                         ",\"distance\":" + to_string(p.second) + "}";
                    first = false;
                }
        string nodes = "[";
        for (size_t i = 0; i < n.size(); i++) {
            int cnt = 0;
            for (Resource* r : resources.all()) if (r->location == n[i]) cnt++;
            int px = 360, py = 240;
            if (campusPositions.count(n[i])) {
                px = campusPositions[n[i]].x;
                py = campusPositions[n[i]].y;
            }
            nodes += (i ? "," : "") + string("{\"name\":") + esc(n[i]) + 
                     ",\"resources\":" + to_string(cnt) + 
                     ",\"x\":" + to_string(px) + 
                     ",\"y\":" + to_string(py) + "}";
        }
        sendJson(res, 200, "{\"nodes\":" + nodes + "],\"edges\":" + e + "]}");
    });

    // GET /api/campus/positions
    svr.Get("/api/campus/positions", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        string posJson = "{";
        bool first = true;
        for (auto& kv : campusPositions) {
            if (!first) posJson += ",";
            posJson += esc(kv.first) + ":{\"x\":" + to_string(kv.second.x) + ",\"y\":" + to_string(kv.second.y) + "}";
            first = false;
        }
        posJson += "}";
        sendJson(res, 200, "{\"ok\":true,\"positions\":" + posJson + "}");
    });

    // POST /api/campus/positions  {"positions": {"Venue": {"x": 100, "y": 200}, ...}}
    svr.Post("/api/campus/positions", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        auto m = parseJson(req.body);
        string singleName = trim(m["name"]);
        int sx = 0, sy = 0;
        if (!singleName.empty() && toInt(trim(m["x"]), sx) && toInt(trim(m["y"]), sy)) {
            campusPositions[singleName] = {sx, sy};
        }
        for (const string& v : campusNodes) {
            size_t p = req.body.find("\"" + v + "\"");
            if (p != string::npos) {
                size_t b1 = req.body.find("{", p);
                size_t b2 = req.body.find("}", b1);
                if (b1 != string::npos && b2 != string::npos && b2 > b1) {
                    string sub = req.body.substr(b1, b2 - b1 + 1);
                    auto sm = parseJson(sub);
                    int px = 0, py = 0;
                    if (toInt(trim(sm["x"]), px) && toInt(trim(sm["y"]), py)) {
                        campusPositions[v] = {px, py};
                    }
                }
            }
        }
        saveAll();
        logAct("system", "Admin locked and saved campus layout positions");
        ok(res, "Campus layout locked and saved to server");
    });

    // GET /api/route?from=MainGate&to=SportsComplex
    svr.Get("/api/route", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        int s = campus.find(param(req, "from")), t = campus.find(param(req, "to"));
        if (s < 0 || t < 0) return fail(res, 400, "Unknown venue");
        vector<int> path;
        int d = campus.shortestPath(s, t, path);
        if (d < 0) return fail(res, 404, "No route found");
        vector<string> names;
        for (int x : path) names.push_back(campus.nodes()[x]);
        sendJson(res, 200, "{\"ok\":true,\"distance\":" + to_string(d) + ",\"path\":" + jStrArr(names) +
                           ",\"walkMinutes\":" + to_string((d + 79) / 80) + "}");
    });

    // POST /api/campus/venue  {name}
    svr.Post("/api/campus/venue", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        auto m = parseJson(req.body);
        string name = trim(m["name"]);
        if (name.empty()) return fail(res, 400, "Venue name is required");
        for (char c : name) {
            if (c == '\t' || c == '\n' || c == '\r') return fail(res, 400, "Invalid venue name");
        }
        if (campus.find(name) >= 0) return fail(res, 409, "Venue already exists");
        int px = 360, py = 240;
        if (toInt(trim(m["x"]), px) && toInt(trim(m["y"]), py)) {
            campusPositions[name] = {px, py};
        } else {
            campusPositions[name] = {360, 240};
        }
        campusNodes.push_back(name);
        campus.addNode(name);
        saveAll();
        logAct("system", "Added campus venue: " + name);
        ok(res, "Venue added: " + name, "\"name\":" + esc(name));
    });

    // POST /api/campus/edge  {from, to, distance}
    svr.Post("/api/campus/edge", [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        auto m = parseJson(req.body);
        string from = trim(m["from"]), to = trim(m["to"]);
        int dist = 0;
        if (from.empty() || to.empty()) return fail(res, 400, "Both from and to venues are required");
        if (from == to) return fail(res, 400, "From and to venues must be different");
        if (!toInt(trim(m["distance"]), dist) || dist <= 0) return fail(res, 400, "Distance must be a positive number in metres");
        if (campus.find(from) < 0) return fail(res, 404, "Unknown starting venue: " + from);
        if (campus.find(to) < 0) return fail(res, 404, "Unknown destination venue: " + to);

        bool updated = false;
        for (auto& e : campusEdges) {
            if ((e[0] == from && e[1] == to) || (e[0] == to && e[1] == from)) {
                e[2] = to_string(dist);
                updated = true;
                break;
            }
        }
        if (!updated) {
            campusEdges.push_back({from, to, to_string(dist)});
        }
        rebuildCampus();
        saveAll();
        string actMsg = (updated ? "Updated" : "Added") + string(" pathway between ") + from + " and " + to + " (" + to_string(dist) + "m)";
        logAct("system", actMsg);
        ok(res, actMsg, "\"distance\":" + to_string(dist));
    });

    // POST /api/campus/edge/delete  {from, to}
    auto deleteEdgeHandler = [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        auto m = parseJson(req.body);
        string from = trim(m["from"]), to = trim(m["to"]);
        if (from.empty() || to.empty()) return fail(res, 400, "Both from and to venues are required");
        auto it = campusEdges.begin();
        bool found = false;
        while (it != campusEdges.end()) {
            if (((*it)[0] == from && (*it)[1] == to) || ((*it)[0] == to && (*it)[1] == from)) {
                it = campusEdges.erase(it);
                found = true;
                break;
            } else {
                ++it;
            }
        }
        if (!found) return fail(res, 404, "Pathway not found");
        rebuildCampus();
        saveAll();
        logAct("system", "Removed pathway between " + from + " and " + to);
        ok(res, "Pathway removed between " + from + " and " + to);
    };
    svr.Post("/api/campus/edge/delete", deleteEdgeHandler);
    svr.Delete("/api/campus/edge", deleteEdgeHandler);

    // POST /api/campus/venue/delete  {name}
    auto deleteVenueHandler = [](const httplib::Request& req, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        auto m = parseJson(req.body);
        string name = trim(m["name"]);
        if (name.empty()) return fail(res, 400, "Venue name is required");
        if (campus.find(name) < 0) return fail(res, 404, "Unknown venue");
        for (Resource* r : resources.all()) {
            if (r->location == name) {
                return fail(res, 409, "Cannot delete venue: resource " + r->name + " (" + r->id + ") is registered here");
            }
        }
        auto itNode = find(campusNodes.begin(), campusNodes.end(), name);
        if (itNode != campusNodes.end()) campusNodes.erase(itNode);
        campusPositions.erase(name);

        auto it = campusEdges.begin();
        while (it != campusEdges.end()) {
            if ((*it)[0] == name || (*it)[1] == name) {
                it = campusEdges.erase(it);
            } else {
                ++it;
            }
        }
        rebuildCampus();
        saveAll();
        logAct("system", "Deleted campus venue: " + name);
        ok(res, "Deleted venue: " + name);
    };
    svr.Post("/api/campus/venue/delete", deleteVenueHandler);
    svr.Delete("/api/campus/venue", deleteVenueHandler);

    // POST /api/campus/reset
    svr.Post("/api/campus/reset", [](const httplib::Request&, httplib::Response& res) {
        lock_guard<mutex> g(mtx);
        loadSampleCampus();
        saveAll();
        logAct("system", "Campus map reset to default");
        ok(res, "Campus map reset to default");
    });

    // ---------------- FRONTEND ----------------
    // Put the built website (index.html etc.) in ./public
    svr.set_mount_point("/", "./public");

    cout << "CampusConnect backend running on http://localhost:" << port << "\n"
         << "API base: http://localhost:" << port << "/api\n"
         << "Press Ctrl+C to stop.\n";
    if (!svr.listen("0.0.0.0", port)) {
        cerr << "Could not start server on port " << port << " (port busy?)\n";
        return 1;
    }
    return 0;
}
