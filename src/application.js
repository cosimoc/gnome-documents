const DBus = imports.dbus;
const Lang = imports.lang;
const Gettext = imports.gettext;

const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const Format = imports.format;
const MainWindow = imports.mainWindow;
const Path = imports.path;

const _GD_DBUS_PATH = '/org/gnome/Documents';

const GdIface = {
    name: 'org.gnome.Documents',

    methods: [ { name: 'activate',
                 inSignature: '',
                 outSignature: '' } ]
};

function RemoteApplication() {
    this._init();
}

RemoteApplication.prototype = {
    _init: function() {
        DBus.session.proxifyObject(this,
                                   GdIface.name,
                                   _GD_DBUS_PATH);
    }
}

DBus.proxifyPrototype(RemoteApplication.prototype, GdIface);

function Application() {
    this._init();
}

Application.prototype = {
    _init: function() {
        DBus.session.acquire_name(GdIface.name,
                                  DBus.SINGLE_INSTANCE,
                                  Lang.bind(this, this._onNameAcquired),
                                  Lang.bind(this, this._onNameNotAcquired));
    },

    _onNameAcquired: function() {
        DBus.session.exportObject(_GD_DBUS_PATH, this);
        this._initReal();
    },

    _onNameNotAcquired: function() {
        let remoteApp = new RemoteApplication();
        remoteApp.activateRemote();

        this.quit();
    },

    _initReal: function() {
        this._initLowlevel();
        this._initGtkSettings();
        this._initMainWindow();

        this.activate();
    },

    _initLowlevel: function() {
        Gettext.bindtextdomain('gnome-documents', Path.LOCALE_DIR);
        Gettext.textdomain('gnome-documents');
        String.prototype.format = Format.format;

        GLib.set_prgname('gnome-documents');
        Gtk.init(null, null);
    },

    _initGtkSettings: function() {
        let settings = Gtk.Settings.get_default();
        settings.gtk_application_prefer_dark_theme = true;

        let provider = new Gtk.CssProvider();
        provider.load_from_path(Path.STYLE_DIR + "gtk-style.css");
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(),
                                                 provider,
                                                 600);
    },

    _initMainWindow: function() {
        this._mainWindow = new MainWindow.MainWindow();
    },

    activate: function() {
        this._mainWindow.window.present();
    },

    quit: function() {
        Gtk.main_quit();
    }
}