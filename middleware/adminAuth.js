const path = require('path');

module.exports = function adminAuth(req, res, next) {
  const { password } = req.query;
  const PASS = process.env.ADMIN_PASSWORD;

  // Check query param
  if (password && password === PASS) {
    res.cookie('adminAuth', PASS, { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 });
    return next();
  }

  // Check cookie
  if (req.cookies && req.cookies.adminAuth === PASS) {
    return next();
  }

  // Show login page as inline HTML (no sendFile needed)
  return res.status(401).send(`<!DOCTYPE html>
<html>
<head>
  <title>Admin Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0a0a;color:#eee;font-family:'Segoe UI',sans-serif;
         display:flex;align-items:center;justify-content:center;height:100vh}
    form{background:#141414;padding:40px;border-radius:10px;text-align:center;
         border:1px solid #2a2a2a;width:320px}
    h2{margin-bottom:24px;font-size:20px}
    input{display:block;width:100%;margin:0 0 16px;padding:12px 16px;
          background:#1e1e1e;border:1px solid #333;color:#fff;border-radius:6px;font-size:15px}
    button{width:100%;padding:12px;background:#00e5ff;color:#000;border:none;
           border-radius:6px;cursor:pointer;font-weight:700;font-size:15px}
    .err{color:#ff4444;font-size:13px;margin-bottom:12px}
  </style>
</head>
<body>
  <form method="GET" action="/admin">
    <h2>🔐 Admin Login</h2>
    ${req.query.password ? '<p class="err">Wrong password, try again.</p>' : ''}
    <input type="password" name="password" placeholder="Enter admin password" required autofocus/>
    <button type="submit">Login</button>
  </form>
</body>
</html>`);
};
