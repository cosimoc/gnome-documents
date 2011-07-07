const Gd = imports.gi.Gd;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;

const Lang = imports.lang;

const Main = imports.main;
const MainToolbar = imports.mainToolbar;
const TrackerModel = imports.trackerModel;
const _ = imports.gettext.gettext;

const _WINDOW_DEFAULT_WIDTH = 860;
const _WINDOW_DEFAULT_HEIGHT = 600;

const _VIEW_ITEM_WIDTH = 152;
const _VIEW_ITEM_WRAP_WIDTH = 140;
const _VIEW_COLUMN_SPACING = 20;
const _VIEW_COLUMNS = 4;
const _VIEW_MARGIN = 16;

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this._initGtkWindow();
        this._initUi();
        this._initModel();
    },

    _initGtkWindow: function() {
        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       resizable: false,
                                       title: _('Documents') });

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));
    },

    _initView: function() {
        this.view = new Gtk.IconView({ hexpand: true,
                                       vexpand: true });

        this.view.item_width = _VIEW_ITEM_WIDTH;
        this.view.column_spacing = _VIEW_COLUMN_SPACING;
        this.view.columns = _VIEW_COLUMNS;
        this.view.margin = _VIEW_MARGIN;
        this.view.set_selection_mode(Gtk.SelectionMode.MULTIPLE);
    },

    _initUi: function() {
        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                    vexpand: true });
        this.window.add(this._grid);

        this.toolbar = new MainToolbar.MainToolbar();
        this.toolbar.setOverview();
        this._grid.add(this.toolbar.toolbar);

        this._scrolledWin = new Gtk.ScrolledWindow({ hexpand: true,
                                                     vexpand: true });
        this._grid.add(this._scrolledWin);
        this._initView();

        this._scrolledWin.add(this.view);

        this._grid.show_all();
    },

    _initModel: function() {
        this._model = new TrackerModel.TrackerModel(Lang.bind(this, this._onModelCreated));
    },

    _setModelView: function() {
        this.view.set_model(this._model.model);
        this.view.set_pixbuf_column(TrackerModel.ModelColumns.ICON);

        this._renderer = new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.CENTER,
                                                   wrap_mode: Pango.WrapMode.WORD_CHAR,
                                                   wrap_width: _VIEW_ITEM_WRAP_WIDTH,
                                                   xalign: 0.5,
                                                   yalign: 0.0,
                                                   text_lines: 3 });
        this.view.pack_start(this._renderer, false);
        this.view.add_attribute(this._renderer,
                                'text', TrackerModel.ModelColumns.TITLE);
        this.view.add_attribute(this._renderer,
                                'line-two', TrackerModel.ModelColumns.AUTHOR);
    },

    _onModelCreated: function() {
        this._setModelView();
        this._model.populateForOverview();
    },

    _onDeleteEvent: function() {
        Main.application.quit();
    }
}
