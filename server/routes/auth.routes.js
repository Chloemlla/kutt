const { Router } = require("express");

const validators = require("../handlers/validators.handler");
const helpers = require("../handlers/helpers.handler");
const asyncHandler = require("../utils/asyncHandler");
const locals = require("../handlers/locals.handler");
const auth = require("../handlers/auth.handler");
const twofa = require("../handlers/twofa.handler");
const passkey = require("../handlers/passkey.handler");
const utils = require("../utils");
const env = require("../env");

const router = Router();

router.post(
  "/login",
  locals.viewTemplate("partials/auth/form"),
  auth.featureAccess([!env.DISALLOW_LOGIN_FORM]),
  validators.login,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 5 }),
  asyncHandler(auth.local),
  asyncHandler(auth.login)
);

router.post(
  "/signup",
  auth.featureAccess([!env.DISALLOW_REGISTRATION, env.MAIL_ENABLED]),
  validators.signup,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 5 }),
  validators.signupEmailTaken,
  asyncHandler(helpers.verify),
  asyncHandler(auth.signup)
);

router.post(
  "/create-admin",
  validators.createAdmin,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 5 }),
  asyncHandler(auth.createAdminUser)
);

router.post(
  "/change-password",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  validators.changePassword,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 5 }),
  asyncHandler(auth.changePassword)
);

router.post(
  "/change-email",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  auth.featureAccess([env.MAIL_ENABLED]),
  validators.changeEmail,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 3 }),
  asyncHandler(auth.changeEmailRequest)
);

router.post(
  "/apikey",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(auth.generateApiKey)
);

router.post(
  "/reset-password",
  auth.featureAccess([env.MAIL_ENABLED]),
  validators.resetPassword,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 3 }),
  asyncHandler(auth.resetPassword)
);

router.post(
  "/new-password",
  locals.newPassword,
  validators.newPassword,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 5 }),
  asyncHandler(auth.newPassword)
);

// Two-Factor Authentication Routes
router.post(
  "/2fa/setup",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  helpers.rateLimit({ window: 60, limit: 5 }),
  asyncHandler(twofa.setup)
);

router.post(
  "/2fa/verify",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  validators.twofaVerify,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(twofa.verify)
);

router.post(
  "/2fa/disable",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  validators.twofaDisable,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 5 }),
  asyncHandler(twofa.disable)
);

router.post(
  "/2fa/verify-token",
  validators.twofaVerifyToken,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(twofa.verifyToken)
);

router.post(
  "/2fa/check-required",
  validators.twofaCheckRequired,
  asyncHandler(helpers.verify),
  helpers.rateLimit({ window: 60, limit: 20 }),
  asyncHandler(twofa.checkRequired)
);

router.post(
  "/2fa/regenerate-backup-codes",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  helpers.rateLimit({ window: 60, limit: 5 }),
  asyncHandler(twofa.regenerateBackupCodes)
);

router.get(
  "/2fa/status",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  asyncHandler(twofa.getStatus)
);

// Passkey (WebAuthn) Routes
router.post(
  "/passkey/register/init",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(passkey.registerInit)
);

router.post(
  "/passkey/register/verify",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(passkey.registerVerify)
);

router.post(
  "/passkey/authenticate/init",
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(passkey.authenticateInit)
);

router.post(
  "/passkey/authenticate/verify",
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(passkey.authenticateVerify)
);

router.get(
  "/passkey/list",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  asyncHandler(passkey.list)
);

router.delete(
  "/passkey/:id",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  helpers.rateLimit({ window: 60, limit: 5 }),
  asyncHandler(passkey.remove)
);

router.patch(
  "/passkey/:id/rename",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(passkey.rename)
);

router.get(
  "/passkey/status",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  asyncHandler(passkey.getStatus)
);

router.post(
  "/passkey/toggle-2fa",
  asyncHandler(auth.apikey),
  asyncHandler(auth.jwtLoose),
  helpers.rateLimit({ window: 60, limit: 10 }),
  asyncHandler(passkey.toggle2FARequired)
);

module.exports = router;
