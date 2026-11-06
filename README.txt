CampusConnect - how to run

1. Install a compiler if you don't have one (MinGW-w64 g++ for Windows, e.g. from https://winlibs.com)
2. Open terminal in this folder and compile:
     g++ -std=c++17 -O2 server.cpp -o campusconnect.exe -lws2_32
3. Run:
     campusconnect.exe
   (different port: campusconnect.exe 9000)
4. Open in browser:
     http://localhost:8080/            website (files inside public folder)
     http://localhost:8080/api/stats   quick check that API works

Files:
  server.cpp              C++ backend (HashMap, MinHeap, Stack, Graph + Dijkstra, REST API)
  httplib.h               HTTP library (single header, do not edit)
  ANTIGRAVITY_PROMPT.md   paste this into Antigravity to build the frontend
  public/                 frontend goes here

Database (file handling):
  All data is saved in the data folder, created automatically on first run.
  It is rewritten after every change and loaded back when the server starts.
    data/resources.txt   resources
    data/bookings.txt    confirmed bookings
    data/waitlist.txt    waitlist entries with priority score
    data/campus.txt      campus map (venue, venue, distance in metres)
    data/undo.txt        undo history (Stack)
    data/meta.txt        request counter used for waitlist order
    data/activity.txt    recent activity log
  Fields are separated by TAB, one record per line.
  To reset everything to sample data: stop the server and delete the data folder.
