/**
 * Role-based access control middleware.
 * Usage: roleMiddleware('admin') or roleMiddleware('admin', 'rider')
 */
const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires role: ${allowedRoles.join(' or ')}.`,
      });
    }

    next();
  };
};

module.exports = roleMiddleware;
