/**
 * Module dependencies.
 */
var express = require('express');
var fs = require('fs');

// Initialize our MongoDB connection
// and our models
var mongoose = require('mongoose');
var models_path = __dirname + '/models';
fs.readdirSync(models_path).forEach( function(file){
	require(models_path + '/' + file);
});

// Other dependencies...
var expressValidator = require('express-validator');
var http = require('http');
var path = require('path');
var passport = require('passport');
var app = express();
var server = http.createServer(app);

// Set the port.  Heroku will set the env var
app.set('port', process.env.PORT || 3000);

// Set the cdn.
app.locals.cdn = process.env.CDN;

// Set a global 5s timeout on requests
// http://www.senchalabs.org/connect/timeout.html
app.use(express.timeout(5000));

// Limit incoming request size.  This will need
// to be increased if we ever start accepting images
// or something.  For now, requests should be very small.
// http://www.senchalabs.org/connect/limit.html
app.use(express.limit('0.25mb'));

// Set up compression
app.use(express.compress());

// Add some misc caching behavior, minor kludge
// since we should do this elsewhere. Clearly, if
// we altered these bg images, we'd need to update
// their paths in order to uncache them in the
// CDN. TODO: improve this.
var longExpiringAssets = [
  '/fonts/',
  '/images/bg.jpg',
  '/images/bg-med.jpg',
];
for (var i = longExpiringAssets.length - 1; i >= 0; i--) {
  app.use(longExpiringAssets[i], function(req, res, next){
    if (!res.getHeader('Cache-Control')){
      res.setHeader('Cache-Control', 'public, max-age=290304000');
    }
    next();
  });

  // Allow cross-domain usage for fonts. This is needed
  // for IE and Firefox users.
  app.use('/fonts/', function(req, res, next){
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });
};

// Handle static content first
// http://www.senchalabs.org/connect/static.html
app.set('static_dir', 'app');
app.use(express.static(app.get('static_dir')));

var assetManager = require('./lib/assets')(app, server);

// Set the location of our views.  We'll use
// nunjucks, as below.
// app.set('views', __dirname + '/views');

// Set up nunjucks templating
var nunjucks = require('nunjucks');
nunjucks.configure('server/views', {
    autoescape: true,
    express: app,
    watch: true,
    tags: {
    	variableStart: '{(',
    	variableEnd: ')}',
    }
});

// Handle a bunch of other crap
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(expressValidator());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.cookieSession({ secret: process.env.COOKIE_SECRET }));

// app.use(express.session());
app.use(passport.initialize());
app.use(passport.session());

// Use CSRF protection for our API, which is the
// only way in which data comes in.  See:
// http://mircozeiss.com/using-csrf-with-express-and-angular/
// This must be done before calling app.router, below.
// 
// We expect all API requests will come from the AngularJS
// client-side application via its $http library.  It puts
// the token into 
app.use('/api/', express.csrf({
  value: function(req){return req.headers['x-xsrf-token']}
}));

// Attach our routes, which are mounted below
app.use(app.router);

// Database configuration
mongoose.connect(process.env.MONGOHQ_URL);

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// Make the programmingLanguages available
// throughout the application, particularly
// in our views.
app.locals.programmingLanguages = require('./lib/languages');


// Add in our controllers
var MeetupController = require('./controllers/meetup');
var ApiController = require('./controllers/api');
var AuthController = require('./controllers/auth');
var DeveloperController = require('./controllers/developer');
var CompanyController = require('./controllers/company');
var AboutController = require('./controllers/about');
var SitemapController = require('./controllers/sitemap');


/**
 * Setup sitemap routes
 *
 * GET  /       Show listing of sitemaps on front page
 */
sitemap = new SitemapController(app);
sitemap.route();

/**
 * Setup Meetup routes
 *
 * GET  /       Show listing of meetups on front page
 */
meetup = new MeetupController(app);
meetup.route();

/**
 * GET  /about  Show about info
 */
about = new AboutController(app);
about.route();

/**
 * GET  /admin  Show admin page
 */
app.get('/admin', function(req, res){
  // Clearly nothing is hidden on this site since it's
  // open source.  But, protect this nonetheless.
  if (req.user) {
    if (req.user.isAdmin()) {
      res.render('admin.html');
    }else{
      return res.status(401).send("Forbidden");
    };
  }else{
    return res.status(403).send("Authentication required");
  };
})
app.get('/profile', function(req, res){
  if (req.user) {
    res.render('admin.html');
  }else{
    return res.status(403).send("Authentication required");
  };
})

/**
 * Setup Developer routes
 *
 * GET  /developers Show a list of developers
 */
Developer = new DeveloperController(app);
Developer.route();

/**
 * Setup Company routes
 *
 * GET  /companies Show a list of developers
 */
Company = new CompanyController(app);
Company.route();

/**
 * Setup Company API routes
 *
 * POST /api/user       Create new user
 * GET  /api/user       Show listing of useres
 * GET  /api/user/{id}  Show user by ID
 * POST /api/company       Create new company
 * GET  /api/company       Show listing of companyes
 * GET  /api/company/{id}  Show company by ID
 */
api = new ApiController(app);
api.route();


/**
 * Setup Authentication routes
 * using Github oAuth
 *
 * GET /auth           Redirect to Github for auth
 * GET /auth/callback  Retrieve token from Github
 * GET /me             Test route to get session-based user info
 */
auth = new AuthController(app);
auth.init(passport).route();


// Start the server
server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});