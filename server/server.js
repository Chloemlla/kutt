const env = require("./env");

const cookieParser = require("cookie-parser");
const compression = require("compression");
const responseTime = require("response-time");
const passport = require("passport");
const express = require("express");
const session = require("cookie-session");
const helmet = require("helmet");
const cors = require("cors");
const path = require("node:path");
const hbs = require("hbs");

const helpers = require("./handlers/helpers.handler");
const renders = require("./handlers/renders.handler");
const asyncHandler = require("./utils/asyncHandler");
const locals = require("./handlers/locals.handler");
const links = require("./handlers/links.handler");
const routes = require("./routes");
const utils = require("./utils");
const memoryMonitor = require("./utils/memoryMonitor");


// run the cron jobs
// the app might be running in cluster mode (multiple instances) so run the cron job only on one cluster (the first one)
// NODE_APP_INSTANCE variable is added by pm2 automatically, if you're using something else to cluster your app, then make sure to set this variable
if (env.NODE_APP_INSTANCE === 0) {
  require("./cron");
}

// Start memory monitoring
memoryMonitor.startMonitoring();

// intialize passport authentication library
require("./passport");

// create express app
const app = express();

// this tells the express app that it's running behind a proxy server
// and thus it should get the IP address from the proxy server
if (env.TRUST_PROXY) {
  app.set("trust proxy", true);
}

// Performance monitoring - add X-Response-Time header
app.use(responseTime());

// Compression middleware - compress all responses
app.use(compression({
  level: 6, // Balance between speed and compression ratio
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress for Server-Sent Events or if no-transform is set
    if (req.headers['x-no-compression'] || res.getHeader('Content-Type')?.includes('text/event-stream')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // In development, allow localhost on any port
    if (env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      // In development, allow any origin with a warning
      console.warn(`CORS: Allowing unknown origin in development: ${origin}`);
      return callback(null, true);
    }

    // Production: only allow the default domain
    const allowedOrigins = [
      `https://${env.DEFAULT_DOMAIN}`,
      `http://${env.DEFAULT_DOMAIN}`,
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`CORS: Blocked origin in production: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY', 'Accept'],
  exposedHeaders: ['X-Response-Time'],
};

app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// use cookie sessions only when OIDC is enabled
// because only OIDC is using it
if (env.OIDC_ENABLED) {
  app.use(session({
    keys: [env.JWT_SECRET],
    maxAge: 1000 * 60 * 60 * 24 * 7, // expire after seven days
  }));
}

// serve static with caching and optimization
const staticOptions = {
  maxAge: env.NODE_ENV === 'production' ? '1y' : 0, // Cache for 1 year in production
  etag: true,
  lastModified: true,
  immutable: true, // Assets won't change
  setHeaders: (res, path) => {
    // Set cache control based on file type
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else if (path.match(/\.(js|css|woff2|woff|ttf|svg|png|jpg|jpeg|gif|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
};

app.use("/images", express.static("custom/images", staticOptions));
app.use("/css", express.static("custom/css", { ...staticOptions, extensions: ["css"] }));
// app.use(express.static("static", staticOptions)); // Disabled: only ../client/dist should serve frontend

// serve frontend SPA assets (js, css, images) with caching
app.use("/assets", express.static(path.join(__dirname, "../client/dist/assets"), {
  maxAge: env.NODE_ENV === 'production' ? '1y' : 0,
  etag: true,
  lastModified: true,
  immutable: true,
  setHeaders: (res, filePath) => {
    if (filePath.match(/\.(js|css|woff2|woff|ttf|svg|png|jpg|jpeg|gif|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

app.use(passport.initialize());
app.use(locals.isHTML);
app.use(locals.config);

// template engine / serve html

app.set("view engine", "hbs");
app.set("views", [
  path.join(__dirname, "../custom/views"),
  path.join(__dirname, "views"),
]);
utils.registerHandlebarsHelpers();

// if is custom domain, redirect to the set homepage
app.use(asyncHandler(links.redirectCustomDomainHomepage));

// render html pages
app.use("/", routes.render);

// handle api requests
app.use("/api/v2", routes.api);
app.use("/api", routes.api);

// SPA fallback - serve index.html for all /app routes (client-side routing)
app.get("/app*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// finally, redirect the short link to the target
app.get("/:id", asyncHandler(links.redirect));

// 404 pages that don't exist
app.get("*", renders.notFound);

// handle errors coming from above routes
app.use(helpers.error);

app.listen(env.PORT, () => {
  console.log(`> Ready on http://localhost:${env.PORT}`);
});
