/**
 * Simple password-based middleware to protect the /admin route.
 * Pass ?password=yourpassword in the URL or set a cookie after login.
 */
module.exports = function adminAuth(req, res, next) {
  const { password } = req.query;

  if (password && password === process.env.ADMIN_PASSWORD) {
    // Set cookie so they don't have to keep passing ?password
    res.cookie('adminAuth', process.env.ADMIN_PASSWORD, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8 // 8 hours
    });
    return next();
  }

  if (req.cookies && req.cookies.adminAuth === process.env.ADMIN_PASSWORD) {
    return next();
  }

  return res.status(401).send(`
    <!DOCTYPE html>
    <html>
      <head><title>Admin Login</title>
        <style>
          body { background:#0d0d0d; color:#eee; font-family:sans-serif;
                 display:flex; align-items:center; justify-content:center; height:100vh; }
          form { background:#1a1a1a; padding:32px; border-radius:8px; text-align:center; }
          input { display:block; margin:12px 0; padding:10px 16px; width:240px;
                  background:#111; border:1px solid #333; color:#fff; border-radius:4px; }
          button { padding:10px 24px; background:#00e5ff; color:#000;
                   border:none; border-radius:4px; cursor:pointer; font-weight:bold; }
        </style>
      </head>
      <body>
        <form method="GET" action="/admin">
          <h2>🔐 Admin Login</h2>
          <input type="password" name="password" placeholder="Enter admin password" required />
          <button type="submit">Login</button>
        </form>
      </body>
    </html>
  `);
};
